import { Inject, Injectable } from '@nestjs/common';
import { ActorType, AuditOutcome, IngestionStatus, ObservationQualityStatus } from '@prisma/client';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { ValidationDomainException } from '@common/errors/app.exception';
import { PrismaService } from '@database/prisma.service';
import {
  APPROVED_RWANDA_AREA_CODES,
  ENVIRONMENTAL_PROVIDER_ADAPTER,
  EnvironmentalProviderAdapter,
} from '@integrations/weather/weather.adapter';
import { AuditService } from '@modules/audit/audit.service';
import { ConsentService } from '@modules/consent/consent.service';
import { GetEnvironmentContextQueryDto } from './dto/environment.dto';

const STALE_OBSERVATION_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export const ENVIRONMENTAL_REGIONAL_CAVEAT =
  'Environmental observations reflect coarse area-level conditions, not individual clinical exposure or personal disease risk.';

export interface EnvironmentalObservationView {
  id: string;
  observation_type: string;
  location_area_id: string;
  value: number;
  unit: string;
  quality_status: ObservationQualityStatus;
  is_stale: boolean;
  observed_at: string;
  source_timestamp: string;
  source_code: string;
  source_name: string;
  is_calculation_approved: boolean;
}

export interface EnvironmentalContextResponse {
  status: 'available' | 'stale' | 'unavailable';
  area_code: string | null;
  regional_caveat: string;
  observations: EnvironmentalObservationView[];
}

export interface EnvironmentIngestionResult {
  ingestion_record_id: string;
  area_code: string;
  status: IngestionStatus;
  items_received: number;
  items_accepted: number;
  completed_at: string;
}

@Injectable()
export class EnvironmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentService: ConsentService,
    private readonly auditService: AuditService,
    @Inject(ENVIRONMENTAL_PROVIDER_ADAPTER)
    private readonly weatherAdapter: EnvironmentalProviderAdapter,
  ) {}

  async ingestAreaObservations(
    areaCode: string,
    options?: { idempotencyKey?: string; actorId?: string | null },
  ): Promise<EnvironmentIngestionResult> {
    if (!(APPROVED_RWANDA_AREA_CODES as readonly string[]).includes(areaCode)) {
      throw new ValidationDomainException('Unsupported environmental area_code.', [
        { field: 'area_code', reason: 'unapproved_area_code' },
      ]);
    }

    if (options?.idempotencyKey) {
      const existingIngestion = await this.prisma.ingestionRecord.findUnique({
        where: { idempotencyKey: options.idempotencyKey },
      });
      if (existingIngestion && existingIngestion.status === IngestionStatus.succeeded) {
        return {
          ingestion_record_id: existingIngestion.id,
          area_code: areaCode,
          status: existingIngestion.status,
          items_received: existingIngestion.itemsReceived,
          items_accepted: existingIngestion.itemsAccepted,
          completed_at: (
            existingIngestion.completedAt ?? existingIngestion.startedAt
          ).toISOString(),
        };
      }
    }

    const primaryDataSource = await this.prisma.dataSource.findUnique({
      where: { code: 'rwanda_synthetic_meteo_sandbox' },
    });

    if (!primaryDataSource) {
      throw new ValidationDomainException(
        'Baseline environmental data source registry entry is not configured.',
        [{ field: 'data_source', reason: 'missing_data_source_seed' }],
      );
    }

    const startedRecord = await this.prisma.ingestionRecord.create({
      data: {
        dataSourceId: primaryDataSource.id,
        status: IngestionStatus.running,
        idempotencyKey: options?.idempotencyKey ?? null,
      },
    });

    try {
      const fetched = await this.weatherAdapter.fetchAreaObservations(areaCode);
      const sourceCodes = Array.from(new Set(fetched.map((item) => item.dataSourceCode)));
      const sources = await this.prisma.dataSource.findMany({
        where: { code: { in: sourceCodes } },
      });
      const sourceMap = new Map(sources.map((s) => [s.code, s]));

      const completedAt = new Date();

      await this.prisma.$transaction(async (tx) => {
        let accepted = 0;
        for (const obs of fetched) {
          const matchedSource = sourceMap.get(obs.dataSourceCode) ?? primaryDataSource;
          await tx.environmentalObservation.create({
            data: {
              dataSourceId: matchedSource.id,
              ingestionRecordId: startedRecord.id,
              observationType: obs.observationType,
              observedAt: obs.observedAt,
              locationAreaId: obs.locationAreaId,
              value: obs.value,
              unit: obs.unit,
              qualityStatus: obs.qualityStatus,
              sourceTimestamp: obs.sourceTimestamp,
              ingestedAt: completedAt,
            },
          });
          accepted += 1;
        }

        await tx.ingestionRecord.update({
          where: { id: startedRecord.id },
          data: {
            status: IngestionStatus.succeeded,
            itemsReceived: fetched.length,
            itemsAccepted: accepted,
            completedAt,
          },
        });

        await this.auditService.record(
          {
            actorId: options?.actorId ?? null,
            actorType: options?.actorId ? ActorType.user : ActorType.service,
            action: 'environment.ingest',
            resourceType: 'ingestion_record',
            resourceId: startedRecord.id,
            outcome: AuditOutcome.succeeded,
            metadata: {
              area_code: areaCode,
              items_accepted: accepted,
            },
          },
          tx,
        );
      });

      return {
        ingestion_record_id: startedRecord.id,
        area_code: areaCode,
        status: IngestionStatus.succeeded,
        items_received: fetched.length,
        items_accepted: fetched.length,
        completed_at: completedAt.toISOString(),
      };
    } catch {
      const failedAt = new Date();
      await this.prisma.ingestionRecord.update({
        where: { id: startedRecord.id },
        data: {
          status: IngestionStatus.failed,
          errorCode: 'PROVIDER_FETCH_FAILED',
          errorSummary: 'Environmental adapter failed to retrieve area observations.',
          completedAt: failedAt,
        },
      });

      await this.auditService.record({
        actorId: options?.actorId ?? null,
        actorType: options?.actorId ? ActorType.user : ActorType.service,
        action: 'environment.ingest',
        resourceType: 'ingestion_record',
        resourceId: startedRecord.id,
        outcome: AuditOutcome.failed,
        metadata: {
          area_code: areaCode,
          error_code: 'PROVIDER_FETCH_FAILED',
        },
      });

      return {
        ingestion_record_id: startedRecord.id,
        area_code: areaCode,
        status: IngestionStatus.failed,
        items_received: 0,
        items_accepted: 0,
        completed_at: failedAt.toISOString(),
      };
    }
  }

  async getEnvironmentalContext(
    principal: AuthenticatedPrincipal,
    query: GetEnvironmentContextQueryDto,
  ): Promise<EnvironmentalContextResponse> {
    let targetAreaCode: string | null = query.area_code ?? null;

    if (targetAreaCode) {
      if (!(APPROVED_RWANDA_AREA_CODES as readonly string[]).includes(targetAreaCode)) {
        throw new ValidationDomainException('Unsupported environmental area_code.', [
          { field: 'area_code', reason: 'unapproved_area_code' },
        ]);
      }
    } else {
      const envConsent = await this.consentService.verifyActiveConsent(
        principal.userAccountId,
        'environmental_context',
        'v1',
      );
      if (envConsent) {
        const profile = await this.prisma.userProfile.findUnique({
          where: { userAccountId: principal.userAccountId },
          select: { administrativeAreaCode: true },
        });
        targetAreaCode = profile?.administrativeAreaCode ?? null;
      }
    }

    if (!targetAreaCode) {
      return {
        status: 'unavailable',
        area_code: null,
        regional_caveat: ENVIRONMENTAL_REGIONAL_CAVEAT,
        observations: [],
      };
    }

    const recentRows = await this.prisma.environmentalObservation.findMany({
      where: {
        locationAreaId: targetAreaCode,
      },
      include: {
        dataSource: true,
      },
      orderBy: [{ observedAt: 'desc' }, { ingestedAt: 'desc' }],
      take: 25,
    });

    const latestByType = new Map<string, (typeof recentRows)[number]>();
    for (const row of recentRows) {
      if (!latestByType.has(row.observationType)) {
        latestByType.set(row.observationType, row);
      }
    }

    if (latestByType.size === 0) {
      return {
        status: 'unavailable',
        area_code: targetAreaCode,
        regional_caveat: ENVIRONMENTAL_REGIONAL_CAVEAT,
        observations: [],
      };
    }

    const nowMs = Date.now();
    const mapped: EnvironmentalObservationView[] = Array.from(latestByType.values()).map((row) => {
      const isStale =
        row.qualityStatus === ObservationQualityStatus.stale ||
        nowMs - row.observedAt.getTime() > STALE_OBSERVATION_THRESHOLD_MS;

      return {
        id: row.id,
        observation_type: row.observationType,
        location_area_id: row.locationAreaId,
        value: row.value,
        unit: row.unit,
        quality_status: isStale ? ObservationQualityStatus.stale : row.qualityStatus,
        is_stale: isStale,
        observed_at: row.observedAt.toISOString(),
        source_timestamp: row.sourceTimestamp.toISOString(),
        source_code: row.dataSource.code,
        source_name: row.dataSource.name,
        is_calculation_approved: row.dataSource.isCalculationApproved,
      };
    });

    const allStale = mapped.every((item) => item.is_stale);

    return {
      status: allStale ? 'stale' : 'available',
      area_code: targetAreaCode,
      regional_caveat: ENVIRONMENTAL_REGIONAL_CAVEAT,
      observations: mapped,
    };
  }
}
