import { Injectable } from '@nestjs/common';
import {
  ActorType,
  AuditOutcome,
  ConsentPurpose,
  ConsentPurposeStatus,
  ConsentRecord,
  ConsentRecordStatus,
  Prisma,
  RoleCode,
} from '@prisma/client';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import {
  ConsentRequiredException,
  ForbiddenOperationException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '@common/errors/app.exception';
import {
  CursorPaginationQueryDto,
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  PaginatedResult,
  paginateItems,
} from '@common/http/pagination.util';
import { PrismaService } from '@database/prisma.service';
import { AuditService } from '@modules/audit/audit.service';
import { GrantConsentDto } from './dto/grant-consent.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ConsentPurposeView {
  id: string;
  code: string;
  version: string;
  title: string;
  description: string;
  data_categories: string[];
  is_required_for_onboarding: boolean;
  status: ConsentPurposeStatus;
}

export interface ConsentRecordView {
  id: string;
  user_account_id: string;
  purpose_code: string;
  version: string;
  policy_version: string;
  status: ConsentRecordStatus;
  granted_at: string | null;
  withdrawn_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listPurposes(): Promise<ConsentPurposeView[]> {
    const purposes = await this.prisma.consentPurpose.findMany({
      where: { status: ConsentPurposeStatus.active },
      orderBy: [{ code: 'asc' }, { version: 'asc' }],
    });
    return purposes.map((p) => this.toPurposeView(p));
  }

  async listAllPurposesForAdmin(): Promise<ConsentPurposeView[]> {
    const purposes = await this.prisma.consentPurpose.findMany({
      orderBy: [{ code: 'asc' }, { version: 'asc' }],
    });
    return purposes.map((p) => this.toPurposeView(p));
  }

  async listUserConsents(
    userAccountId: string,
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<ConsentRecordView>> {
    const limit = pagination.limit ?? DEFAULT_PAGE_LIMIT;
    const cursorFilter = this.buildCursorFilter(pagination.cursor);

    const where: Prisma.ConsentRecordWhereInput = {
      userAccountId,
      ...(cursorFilter ? { AND: [cursorFilter] } : {}),
    };

    const rows = await this.prisma.consentRecord.findMany({
      where,
      include: { consentPurpose: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((row) => this.toRecordView(row, row.consentPurpose));
    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.created_at,
    }));
  }

  async grantConsent(
    principal: AuthenticatedPrincipal,
    dto: GrantConsentDto,
  ): Promise<ConsentRecordView> {
    if (!principal.roles.includes(RoleCode.citizen)) {
      throw new ForbiddenOperationException(
        'Only citizen accounts may grant personal data consent.',
      );
    }

    const version = dto.version ?? 'v1';
    const purpose = await this.prisma.consentPurpose.findUnique({
      where: {
        code_version: {
          code: dto.purpose_code,
          version,
        },
      },
    });

    if (!purpose || purpose.status !== ConsentPurposeStatus.active) {
      throw new ValidationDomainException(
        'The requested consent purpose or version is not active.',
        [{ field: 'purpose_code', reason: 'unknown_or_inactive_purpose' }],
      );
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existingActive = await tx.consentRecord.findFirst({
        where: {
          userAccountId: principal.userAccountId,
          consentPurposeId: purpose.id,
          status: ConsentRecordStatus.granted,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: [{ createdAt: 'desc' }],
      });

      if (existingActive) {
        await this.auditService.record(
          {
            actorId: principal.userAccountId,
            actorType: ActorType.user,
            action: 'consent.grant',
            resourceType: 'consent_record',
            resourceId: existingActive.id,
            outcome: AuditOutcome.succeeded,
            purposeCode: purpose.code,
            metadata: {
              version: purpose.version,
              idempotent_noop: true,
            },
          },
          tx,
        );
        return this.toRecordView(existingActive, purpose);
      }

      const created = await tx.consentRecord.create({
        data: {
          userAccountId: principal.userAccountId,
          consentPurposeId: purpose.id,
          status: ConsentRecordStatus.granted,
          grantedAt: now,
          recordedById: principal.userAccountId,
          policyVersion: purpose.version,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'consent.grant',
          resourceType: 'consent_record',
          resourceId: created.id,
          outcome: AuditOutcome.succeeded,
          purposeCode: purpose.code,
          metadata: {
            version: purpose.version,
          },
        },
        tx,
      );

      return this.toRecordView(created, purpose);
    });
  }

  async withdrawConsent(
    principal: AuthenticatedPrincipal,
    consentId: string,
  ): Promise<ConsentRecordView> {
    if (!principal.roles.includes(RoleCode.citizen)) {
      throw new ForbiddenOperationException(
        'Only citizen accounts may withdraw personal data consent.',
      );
    }

    if (!UUID_REGEX.test(consentId)) {
      throw new ResourceNotFoundException();
    }

    const existing = await this.prisma.consentRecord.findUnique({
      where: { id: consentId },
      include: { consentPurpose: true },
    });

    if (!existing) {
      throw new ResourceNotFoundException();
    }

    if (existing.userAccountId !== principal.userAccountId) {
      // Record denied audit event outside any rolled-back transaction, then return 404 NOT_FOUND (ADR-004)
      await this.auditService.record({
        actorId: principal.userAccountId,
        actorType: ActorType.user,
        action: 'consent.withdraw',
        resourceType: 'consent_record',
        resourceId: consentId,
        outcome: AuditOutcome.denied,
        purposeCode: existing.consentPurpose.code,
        metadata: {
          reason: 'cross_user_access_denied',
        },
      });
      throw new ResourceNotFoundException();
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      if (existing.status === ConsentRecordStatus.withdrawn) {
        await this.auditService.record(
          {
            actorId: principal.userAccountId,
            actorType: ActorType.user,
            action: 'consent.withdraw',
            resourceType: 'consent_record',
            resourceId: existing.id,
            outcome: AuditOutcome.succeeded,
            purposeCode: existing.consentPurpose.code,
            metadata: {
              version: existing.consentPurpose.version,
              idempotent_noop: true,
            },
          },
          tx,
        );
        return this.toRecordView(existing, existing.consentPurpose);
      }

      const updated = await tx.consentRecord.update({
        where: { id: existing.id },
        data: {
          status: ConsentRecordStatus.withdrawn,
          withdrawnAt: now,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'consent.withdraw',
          resourceType: 'consent_record',
          resourceId: updated.id,
          outcome: AuditOutcome.succeeded,
          purposeCode: existing.consentPurpose.code,
          metadata: {
            version: existing.consentPurpose.version,
          },
        },
        tx,
      );

      return this.toRecordView(updated, existing.consentPurpose);
    });
  }

  /**
   * Verifies at processing time whether `userAccountId` holds an active, unwithdrawn,
   * unexpired `ConsentRecord` for `(purposeCode, version)` (ACCESS_CONTROL.md §8, T-044).
   */
  async verifyActiveConsent(
    userAccountId: string,
    purposeCode: string,
    version = 'v1',
    tx?: Prisma.TransactionClient,
  ): Promise<ConsentRecord | null> {
    const client = tx ?? this.prisma;
    const now = new Date();

    return client.consentRecord.findFirst({
      where: {
        userAccountId,
        status: ConsentRecordStatus.granted,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        consentPurpose: {
          code: purposeCode,
          version,
          status: ConsentPurposeStatus.active,
        },
      },
      orderBy: [{ grantedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Enforces active consent for the caller's own sensitive processing, writing a denied
   * audit event and throwing `403 CONSENT_REQUIRED` if absent or withdrawn.
   */
  async requireActiveConsent(
    userAccountId: string,
    purposeCode: string,
    version = 'v1',
  ): Promise<ConsentRecord> {
    const record = await this.verifyActiveConsent(userAccountId, purposeCode, version);
    if (!record) {
      await this.auditService.record({
        actorId: userAccountId,
        actorType: ActorType.user,
        action: 'consent.verify',
        resourceType: 'consent_purpose',
        resourceId: `${purposeCode}:${version}`,
        outcome: AuditOutcome.denied,
        purposeCode,
        metadata: {
          version,
          reason: 'missing_active_consent',
        },
      });
      throw new ConsentRequiredException(purposeCode);
    }
    return record;
  }

  private buildCursorFilter(cursor?: string): Prisma.ConsentRecordWhereInput | undefined {
    if (!cursor) {
      return undefined;
    }
    const decoded = decodeCursor(cursor);
    const sortDate = new Date(decoded.sortValue);
    if (Number.isNaN(sortDate.getTime())) {
      return undefined;
    }
    return {
      OR: [
        { createdAt: { lt: sortDate } },
        {
          createdAt: sortDate,
          id: { lt: decoded.id },
        },
      ],
    };
  }

  private toPurposeView(purpose: ConsentPurpose): ConsentPurposeView {
    return {
      id: purpose.id,
      code: purpose.code,
      version: purpose.version,
      title: purpose.title,
      description: purpose.description,
      data_categories: purpose.dataCategories,
      is_required_for_onboarding: purpose.isRequiredForOnboarding,
      status: purpose.status,
    };
  }

  private toRecordView(record: ConsentRecord, purpose: ConsentPurpose): ConsentRecordView {
    return {
      id: record.id,
      user_account_id: record.userAccountId,
      purpose_code: purpose.code,
      version: purpose.version,
      policy_version: record.policyVersion,
      status: record.status,
      granted_at: record.grantedAt ? record.grantedAt.toISOString() : null,
      withdrawn_at: record.withdrawnAt ? record.withdrawnAt.toISOString() : null,
      expires_at: record.expiresAt ? record.expiresAt.toISOString() : null,
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString(),
    };
  }
}
