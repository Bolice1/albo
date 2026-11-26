import { Inject, Injectable } from '@nestjs/common';
import {
  AccountStatus,
  ActorType,
  AssignmentStatus,
  AuditOutcome,
  Consultation,
  ConsultationStatus,
  DataSource,
  Facility,
  FacilityService as PrismaFacilityService,
  FacilityStatus,
  FacilityType,
  HealthInput,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  ProviderFollowUp,
  Referral,
  ReferralStatus,
  ReferralType,
  RiskAssessment,
  RoleCode,
  RuleModelVersion,
  RiskUseCase,
} from '@prisma/client';
import { AppConfigService } from '@config/app-config.service';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import {
  FeatureDisabledException,
  ForbiddenOperationException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '@common/errors/app.exception';
import {
  CursorPaginationQueryDto,
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  PaginatedResult,
  paginateItems,
} from '@common/http/pagination.util';
import { PrismaService } from '@database/prisma.service';
import {
  buildUnavailableDirectionsSummary,
  DIRECTIONS_ADAPTER,
  DirectionsAdapter,
  DirectionsSummaryResult,
} from '@integrations/maps/directions.adapter';
import { AuditService } from '@modules/audit/audit.service';
import { ConsentService } from '@modules/consent/consent.service';
import { AccessPolicyService } from '@modules/identity-access/access-policy.service';
import {
  CreateConsultationDto,
  CreateProviderFollowUpDto,
  CreateReferralDto,
  GetFacilityDetailQueryDto,
  SearchFacilitiesQueryDto,
  SearchProvidersQueryDto,
  UpdateConsultationStatusDto,
} from './dto/facilities-care.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_PROXIMITY_RADIUS_KM = 25;
const MAX_PROXIMITY_RADIUS_KM = 100;

export const CLINICAL_AVAILABILITY_CAVEAT =
  'Directory information reflects the last verified registry record and does not guarantee real-time clinical staffing, emergency bed capacity, or medication stock availability.';

export const PROVIDER_RISK_NON_DIAGNOSTIC_NOTICE =
  'This rule-generated preventive indicator summarizes modifiable and contextual risk factors only. It is not a medical diagnosis and does not replace independent clinical evaluation.';

export interface FacilityServiceView {
  id: string;
  service_code: string;
  service_name: string;
  status: string;
  last_verified_at: string;
}

export interface FacilityView {
  id: string;
  name: string;
  facility_type: FacilityType;
  status: FacilityStatus;
  address: string;
  administrative_area_code: string;
  latitude: number;
  longitude: number;
  distance_km: number | null;
  contact_phone: string | null;
  contact_email: string | null;
  opening_hours_summary: string | null;
  source_name: string;
  source_reference: string;
  last_verified_at: string;
  verification_note: string | null;
  availability_caveat: string;
  services: FacilityServiceView[];
}

export interface FacilityDetailView extends FacilityView {
  directions: DirectionsSummaryResult | null;
}

export interface PublicProviderDirectoryView {
  id: string;
  user_account_id: string;
  display_name: string;
  specialty_tags: string[];
  organization_id: string | null;
  organization_name: string | null;
  license_verified_at: string | null;
}

export interface ReferralView {
  id: string;
  citizen_user_id: string;
  provider_user_id: string | null;
  facility_id: string | null;
  created_by_id: string;
  type: ReferralType;
  status: ReferralStatus;
  purpose: string;
  consent_record_id: string;
  scheduled_at: string | null;
  notes_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultationView {
  id: string;
  citizen_user_id: string;
  provider_user_id: string;
  organization_id: string;
  assignment_id: string | null;
  created_by_id: string;
  status: ConsultationStatus;
  purpose: string;
  consent_record_id: string;
  requested_for_at: string | null;
  scheduled_at: string | null;
  workflow_mode: 'scheduling_and_request_only';
  workflow_notice: string;
  created_at: string;
  updated_at: string;
}

export interface AssignedCitizenSummaryView {
  assignment_id: string;
  citizen_user_id: string;
  display_name: string | null;
  administrative_area_code: string | null;
  organization_id: string;
  organization_name: string;
  allowed_scopes: string[];
  starts_at: string;
  ends_at: string | null;
}

export interface ProviderCitizenOverviewView {
  citizen_user_id: string;
  assignment_id: string;
  organization_id: string;
  allowed_scopes: string[];
  profile: {
    display_name: string | null;
    birth_year: number | null;
    administrative_area_code: string | null;
    preferred_language: string;
  };
  active_health_inputs_count: number;
  latest_risk_assessment: {
    id: string;
    use_case_code: string;
    status: string;
    level: string | null;
    rule_model_version: string;
    calculated_at: string | null;
    limitations: string[];
    non_diagnostic_notice: string;
  } | null;
  recent_follow_ups_count: number;
  provenance_notice: string;
}

export interface ProviderHealthInputView {
  id: string;
  category: string;
  field_code: string;
  numeric_value: number | null;
  text_value: string | null;
  unit: string | null;
  source_type: string;
  source_reference: string | null;
  observed_at: string;
  age_hours: number;
  status: string;
  supersedes_input_id: string | null;
  provenance_note: string;
}

export interface ProviderRiskAssessmentView {
  id: string;
  use_case_code: string;
  status: string;
  level: string | null;
  rule_model_version: string;
  calculated_at: string | null;
  age_hours: number | null;
  contributing_factors: unknown;
  limitations: string[];
  recommended_next_steps: unknown;
  input_snapshot_id: string;
  non_diagnostic_notice: string;
}

export interface ProviderFollowUpView {
  id: string;
  assignment_id: string;
  provider_user_id: string;
  citizen_user_id: string;
  referenced_assessment_id: string | null;
  action_type: string;
  structured_notes: Record<string, unknown>;
  recommended_follow_up_at: string | null;
  source_type: 'provider_recorded';
  created_at: string;
}

type FacilityWithRelations = Facility & {
  dataSource: DataSource;
  services: PrismaFacilityService[];
};

@Injectable()
export class FacilitiesCareService {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly consentService: ConsentService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly auditService: AuditService,
    @Inject(DIRECTIONS_ADAPTER)
    private readonly directionsAdapter: DirectionsAdapter,
  ) {}

  async searchFacilities(
    principal: AuthenticatedPrincipal,
    query: SearchFacilitiesQueryDto,
  ): Promise<PaginatedResult<FacilityView>> {
    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const hasLat = query.latitude !== undefined;
    const hasLng = query.longitude !== undefined;

    if (hasLat !== hasLng) {
      throw new ValidationDomainException(
        'Both latitude and longitude must be provided together for proximity search.',
        [{ field: 'coordinates', reason: 'both_latitude_and_longitude_required' }],
      );
    }

    if (hasLat && hasLng) {
      const latitude = query.latitude as number;
      const longitude = query.longitude as number;
      const radiusKm = Math.min(
        Math.max(0.1, query.radius_km ?? DEFAULT_PROXIMITY_RADIUS_KM),
        MAX_PROXIMITY_RADIUS_KM,
      );
      const radiusMeters = radiusKm * 1000;

      // Enforce explicit location-search consent (FR-026, FR-028, ADR-015)
      await this.consentService.requireActiveConsent(
        principal.userAccountId,
        'facility_location_search',
        'v1',
      );

      const areaCode = query.area_code ?? null;
      const facilityType = query.facility_type ?? null;
      const serviceCode = query.service_code ?? null;
      const takeLimit = limit + 1;

      // Parameterized PostGIS ST_DWithin + ST_Distance query (zero string concatenation; caller GPS never persisted)
      const spatialMatches = await this.prisma.$queryRaw<
        Array<{ id: string; distance_km: number }>
      >`
        SELECT
          f."id",
          ROUND((ST_Distance(
            f."location",
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
          ) / 1000.0)::numeric, 1)::float8 AS "distance_km"
        FROM "facilities" f
        WHERE f."status" = 'active'::"FacilityStatus"
          AND f."location" IS NOT NULL
          AND ST_DWithin(
            f."location",
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
            ${radiusMeters}
          )
          AND (${areaCode}::text IS NULL OR f."administrative_area_code" = ${areaCode})
          AND (${facilityType}::text IS NULL OR f."facility_type"::text = ${facilityType})
          AND (
            ${serviceCode}::text IS NULL OR EXISTS (
              SELECT 1
              FROM "facility_services" fs
              WHERE fs."facility_id" = f."id"
                AND fs."service_code" = ${serviceCode}
                AND fs."status" = 'active'
            )
          )
        ORDER BY
          ST_Distance(
            f."location",
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
          ) ASC,
          f."id" ASC
        LIMIT ${takeLimit}
      `;

      const matchedIds = spatialMatches.map((row) => row.id);
      const distanceById = new Map<string, number>(
        spatialMatches.map((row) => [row.id, Math.round(Number(row.distance_km) * 10) / 10]),
      );

      const facilities =
        matchedIds.length > 0
          ? await this.prisma.facility.findMany({
              where: { id: { in: matchedIds } },
              include: {
                dataSource: true,
                services: {
                  where: { status: 'active' },
                  orderBy: { serviceCode: 'asc' },
                },
              },
            })
          : [];

      const facilityById = new Map<string, FacilityWithRelations>(
        facilities.map((fac) => [fac.id, fac]),
      );

      const orderedViews: FacilityView[] = [];
      for (const id of matchedIds) {
        const fac = facilityById.get(id);
        if (fac) {
          orderedViews.push(this.toFacilityView(fac, distanceById.get(id) ?? null));
        }
      }

      const paginated = paginateItems(orderedViews, limit, (item) => ({
        id: item.id,
        sortValue: String(item.distance_km ?? 0),
      }));

      // Record redacted audit event (zero caller coordinates stored or logged — T-036)
      await this.auditService.record({
        actorId: principal.userAccountId,
        actorType: ActorType.user,
        action: 'facility.proximity_search',
        resourceType: 'facility_directory',
        outcome: AuditOutcome.succeeded,
        purposeCode: 'facility_location_search',
        metadata: {
          radius_km: radiusKm,
          area_code: areaCode,
          facility_type: facilityType,
          service_code: serviceCode,
          results_count: paginated.items.length,
        },
      });

      return paginated;
    }

    const cursorFilter = this.buildFacilityCursorFilter(query.cursor);
    const where: Prisma.FacilityWhereInput = {
      status: FacilityStatus.active,
      ...(query.area_code ? { administrativeAreaCode: query.area_code } : {}),
      ...(query.facility_type ? { facilityType: query.facility_type } : {}),
      ...(query.service_code
        ? {
            services: {
              some: {
                serviceCode: query.service_code,
                status: 'active',
              },
            },
          }
        : {}),
      ...(cursorFilter ? { AND: [cursorFilter] } : {}),
    };

    const rows = await this.prisma.facility.findMany({
      where,
      include: {
        dataSource: true,
        services: {
          where: { status: 'active' },
          orderBy: { serviceCode: 'asc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((fac) => this.toFacilityView(fac, null));
    return paginateItems(mapped, limit, (item) => {
      const sourceRow = rows.find((r) => r.id === item.id);
      return {
        id: item.id,
        sortValue: sourceRow ? sourceRow.createdAt.toISOString() : item.last_verified_at,
      };
    });
  }

  async getFacilityById(
    principal: AuthenticatedPrincipal,
    facilityId: string,
    query: GetFacilityDetailQueryDto,
  ): Promise<FacilityDetailView> {
    if (!UUID_REGEX.test(facilityId)) {
      throw new ResourceNotFoundException('Facility was not found.');
    }

    const hasFromLat = query.from_lat !== undefined;
    const hasFromLng = query.from_lng !== undefined;
    if (hasFromLat !== hasFromLng) {
      throw new ValidationDomainException(
        'Both from_lat and from_lng must be provided together to request directions.',
        [{ field: 'coordinates', reason: 'both_from_lat_and_from_lng_required' }],
      );
    }

    const facility = await this.prisma.facility.findFirst({
      where: {
        id: facilityId,
        status: FacilityStatus.active,
      },
      include: {
        dataSource: true,
        services: {
          where: { status: 'active' },
          orderBy: { serviceCode: 'asc' },
        },
      },
    });

    if (!facility) {
      throw new ResourceNotFoundException('Facility was not found.');
    }

    let directions: DirectionsSummaryResult | null = null;
    if (hasFromLat && hasFromLng) {
      await this.consentService.requireActiveConsent(
        principal.userAccountId,
        'facility_location_search',
        'v1',
      );

      const travelMode = query.travel_mode ?? 'driving';
      try {
        directions = await this.directionsAdapter.computeDirectionsSummary({
          origin: {
            latitude: query.from_lat as number,
            longitude: query.from_lng as number,
          },
          destination: {
            latitude: facility.latitude,
            longitude: facility.longitude,
          },
          travelMode,
        });
      } catch {
        directions = buildUnavailableDirectionsSummary(
          travelMode,
          'DIRECTIONS_PROVIDER_UNAVAILABLE',
        );
      }
    }

    return {
      ...this.toFacilityView(facility, directions?.distance_km ?? null),
      directions,
    };
  }

  async hasActiveVerifiedFacilities(): Promise<boolean> {
    const count = await this.prisma.facility.count({
      where: { status: FacilityStatus.active },
    });
    return count > 0;
  }

  /**
   * Deterministic facility lookup for AI Assistant grounding and crisis escalation (HAZ-04, FR-024).
   * Returns verified PostgreSQL Facility cards with `source_name` and `last_verified_at`.
   */
  async findVerifiedFacilitiesByTags(
    recommendedTags: readonly string[],
    maxResults = 4,
  ): Promise<FacilityView[]> {
    const cleanTags = Array.from(
      new Set(recommendedTags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0)),
    );

    const validFacilityTypes = new Set<string>(Object.values(FacilityType));
    const matchedTypes = cleanTags.filter((tag) => validFacilityTypes.has(tag)) as FacilityType[];
    const serviceTags = new Set<string>(cleanTags);
    if (serviceTags.has('pharmacy')) {
      serviceTags.add('pharmacy_guidance');
    }
    if (serviceTags.has('urgent_care')) {
      serviceTags.add('emergency_care');
      serviceTags.add('primary_care');
    }

    const orFilters: Prisma.FacilityWhereInput[] = [];
    if (serviceTags.size > 0) {
      orFilters.push({
        services: {
          some: {
            serviceCode: { in: Array.from(serviceTags) },
            status: 'active',
          },
        },
      });
    }
    if (matchedTypes.length > 0) {
      orFilters.push({
        facilityType: { in: matchedTypes },
      });
    }

    let rows = await this.prisma.facility.findMany({
      where: {
        status: FacilityStatus.active,
        ...(orFilters.length > 0 ? { OR: orFilters } : {}),
      },
      include: {
        dataSource: true,
        services: {
          where: { status: 'active' },
          orderBy: { serviceCode: 'asc' },
        },
      },
      orderBy: [{ lastVerifiedAt: 'desc' }, { name: 'asc' }],
      take: maxResults,
    });

    if (rows.length === 0) {
      rows = await this.prisma.facility.findMany({
        where: { status: FacilityStatus.active },
        include: {
          dataSource: true,
          services: {
            where: { status: 'active' },
            orderBy: { serviceCode: 'asc' },
          },
        },
        orderBy: [{ lastVerifiedAt: 'desc' }, { name: 'asc' }],
        take: maxResults,
      });
    }

    return rows.map((row) => this.toFacilityView(row, null));
  }

  async searchPublicProviders(
    query: SearchProvidersQueryDto,
  ): Promise<PaginatedResult<PublicProviderDirectoryView>> {
    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const cursorFilter = this.buildProviderProfileCursorFilter(query.cursor);

    const rows = await this.prisma.providerProfile.findMany({
      where: {
        publicDirectoryVisible: true,
        userAccount: {
          accountStatus: AccountStatus.active,
        },
        ...(query.specialty_tag ? { specialtyTags: { has: query.specialty_tag } } : {}),
        ...(query.organization_id ? { organizationId: query.organization_id } : {}),
        OR: [{ organizationId: null }, { organization: { status: OrganizationStatus.active } }],
        ...(cursorFilter ? { AND: [cursorFilter] } : {}),
      },
      include: {
        userAccount: {
          include: {
            profile: {
              select: {
                displayName: true,
              },
            },
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped: PublicProviderDirectoryView[] = rows.map((row) => ({
      id: row.id,
      user_account_id: row.userAccountId,
      display_name: row.userAccount.profile?.displayName ?? 'Verified Healthcare Provider',
      specialty_tags: row.specialtyTags,
      organization_id: row.organizationId,
      organization_name: row.organization?.name ?? null,
      license_verified_at: row.licenseVerifiedAt ? row.licenseVerifiedAt.toISOString() : null,
    }));

    return paginateItems(mapped, limit, (item) => {
      const sourceRow = rows.find((r) => r.id === item.id);
      return {
        id: item.id,
        sortValue: sourceRow ? sourceRow.createdAt.toISOString() : new Date(0).toISOString(),
      };
    });
  }

  async createReferral(
    principal: AuthenticatedPrincipal,
    dto: CreateReferralDto,
  ): Promise<ReferralView> {
    if (!dto.facility_id && !dto.provider_user_id) {
      throw new ValidationDomainException(
        'A referral must specify at least one target facility_id or provider_user_id.',
        [{ field: 'facility_id', reason: 'facility_or_provider_required' }],
      );
    }

    if (dto.facility_id) {
      const facility = await this.prisma.facility.findFirst({
        where: { id: dto.facility_id, status: FacilityStatus.active },
      });
      if (!facility) {
        throw new ResourceNotFoundException('Target facility was not found or is inactive.');
      }
    }

    const isProviderInitiatingForCitizen =
      Boolean(dto.citizen_user_id && dto.citizen_user_id !== principal.userAccountId) &&
      (principal.roles.includes(RoleCode.provider) ||
        principal.roles.includes(RoleCode.community_health_worker));

    if (isProviderInitiatingForCitizen) {
      const targetCitizenId = dto.citizen_user_id as string;
      const verified = await this.accessPolicy.verifyProviderAccessToCitizen({
        principal,
        citizenUserId: targetCitizenId,
        requiredScope: 'create_referral',
      });

      const targetProviderId = dto.provider_user_id ?? principal.userAccountId;
      await this.assertActiveProviderTarget(targetProviderId, false);

      return this.prisma.$transaction(async (tx) => {
        const created = await tx.referral.create({
          data: {
            citizenUserId: targetCitizenId,
            providerUserId: dto.provider_user_id ?? null,
            facilityId: dto.facility_id ?? null,
            createdById: principal.userAccountId,
            type: dto.type,
            status: ReferralStatus.requested,
            purpose: dto.purpose.trim(),
            consentRecordId: verified.providerSharingConsent.id,
            scheduledAt: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
            notesSummary: dto.notes_summary?.trim() ?? null,
          },
        });

        await this.auditService.record(
          {
            actorId: principal.userAccountId,
            actorType: ActorType.user,
            action: 'referral.create',
            resourceType: 'referral',
            resourceId: created.id,
            outcome: AuditOutcome.succeeded,
            organizationId: verified.assignment.organizationId,
            purposeCode: 'provider_data_sharing',
            metadata: {
              initiated_by: 'provider',
              citizen_user_id: targetCitizenId,
              referral_type: created.type,
              facility_id: created.facilityId,
              provider_user_id: created.providerUserId,
            },
          },
          tx,
        );

        return this.toReferralView(created);
      });
    }

    // Citizen self-initiated path: block cross-user citizen_user_id spoofing with 404 NOT_FOUND
    if (dto.citizen_user_id && dto.citizen_user_id !== principal.userAccountId) {
      await this.accessPolicy.assertOwnerOrThrowNotFound(
        dto.citizen_user_id,
        principal.userAccountId,
        {
          resourceType: 'citizen_record',
          resourceId: dto.citizen_user_id,
          action: 'referral.create',
        },
      );
    }

    this.accessPolicy.assertCitizenSelf(principal);

    if (dto.provider_user_id) {
      await this.assertActiveProviderTarget(dto.provider_user_id, true, principal.userAccountId);
    }

    // Prefer `provider_data_sharing` per ADR-015; allow `facility_location_search` fallback only for pure facility contact
    let consentRecord = await this.consentService.verifyActiveConsent(
      principal.userAccountId,
      'provider_data_sharing',
      'v1',
    );
    let usedPurposeCode = 'provider_data_sharing';

    if (!consentRecord && !dto.provider_user_id && dto.type === ReferralType.facility_referral) {
      const locationConsent = await this.consentService.verifyActiveConsent(
        principal.userAccountId,
        'facility_location_search',
        'v1',
      );
      if (locationConsent) {
        consentRecord = locationConsent;
        usedPurposeCode = 'facility_location_search';
      }
    }

    if (!consentRecord) {
      consentRecord = await this.consentService.requireActiveConsent(
        principal.userAccountId,
        'provider_data_sharing',
        'v1',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.referral.create({
        data: {
          citizenUserId: principal.userAccountId,
          providerUserId: dto.provider_user_id ?? null,
          facilityId: dto.facility_id ?? null,
          createdById: principal.userAccountId,
          type: dto.type,
          status: ReferralStatus.requested,
          purpose: dto.purpose.trim(),
          consentRecordId: consentRecord.id,
          scheduledAt: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
          notesSummary: dto.notes_summary?.trim() ?? null,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'referral.create',
          resourceType: 'referral',
          resourceId: created.id,
          outcome: AuditOutcome.succeeded,
          purposeCode: usedPurposeCode,
          metadata: {
            initiated_by: 'citizen',
            referral_type: created.type,
            facility_id: created.facilityId,
            provider_user_id: created.providerUserId,
          },
        },
        tx,
      );

      return this.toReferralView(created);
    });
  }

  async listReferrals(
    principal: AuthenticatedPrincipal,
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<ReferralView>> {
    const limit = Math.min(Math.max(1, pagination.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const cursorFilter = this.buildReferralCursorFilter(pagination.cursor);

    const authorizedCitizenIdsForProvider =
      await this.resolveCurrentlyAuthorizedCitizenIds(principal);

    const visibilityBranches: Prisma.ReferralWhereInput[] = [
      { citizenUserId: principal.userAccountId },
    ];
    if (authorizedCitizenIdsForProvider.length > 0) {
      visibilityBranches.push({
        citizenUserId: { in: authorizedCitizenIdsForProvider },
        OR: [{ providerUserId: principal.userAccountId }, { createdById: principal.userAccountId }],
      });
    }

    const rows = await this.prisma.referral.findMany({
      where: {
        OR: visibilityBranches,
        ...(cursorFilter ? { AND: [cursorFilter] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((row) => this.toReferralView(row));
    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.created_at,
    }));
  }

  async getReferralById(
    principal: AuthenticatedPrincipal,
    referralId: string,
  ): Promise<ReferralView> {
    if (!UUID_REGEX.test(referralId)) {
      throw new ResourceNotFoundException();
    }

    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
    });

    if (!referral) {
      throw new ResourceNotFoundException();
    }

    if (referral.citizenUserId === principal.userAccountId) {
      return this.toReferralView(referral);
    }

    const isProviderParty =
      (referral.providerUserId === principal.userAccountId ||
        referral.createdById === principal.userAccountId) &&
      (principal.roles.includes(RoleCode.provider) ||
        principal.roles.includes(RoleCode.community_health_worker));

    if (isProviderParty) {
      await this.accessPolicy.verifyProviderAccessToCitizen({
        principal,
        citizenUserId: referral.citizenUserId,
        requiredScope: 'view_summary',
      });
      return this.toReferralView(referral);
    }

    await this.accessPolicy.assertOwnerOrThrowNotFound(
      referral.citizenUserId,
      principal.userAccountId,
      {
        resourceType: 'referral',
        resourceId: referralId,
        action: 'referral.read',
      },
    );
    return this.toReferralView(referral);
  }

  async createConsultation(
    principal: AuthenticatedPrincipal,
    dto: CreateConsultationDto,
  ): Promise<ConsultationView> {
    const isProviderInitiating =
      Boolean(dto.citizen_user_id && dto.citizen_user_id !== principal.userAccountId) &&
      (principal.roles.includes(RoleCode.provider) ||
        principal.roles.includes(RoleCode.community_health_worker));

    if (isProviderInitiating) {
      const targetCitizenId = dto.citizen_user_id as string;
      const verified = await this.accessPolicy.verifyProviderAccessToCitizen({
        principal,
        citizenUserId: targetCitizenId,
        requiredScope: 'initiate_consultation',
      });

      const providerUserId = dto.provider_user_id ?? principal.userAccountId;
      if (providerUserId !== principal.userAccountId) {
        throw new ForbiddenOperationException(
          'Providers may initiate consultations only under their own authenticated identity.',
        );
      }

      const scheduledAt = dto.scheduled_at ? new Date(dto.scheduled_at) : null;
      const requestedForAt = dto.requested_for_at ? new Date(dto.requested_for_at) : null;

      return this.prisma.$transaction(async (tx) => {
        const created = await tx.consultation.create({
          data: {
            citizenUserId: targetCitizenId,
            providerUserId: principal.userAccountId,
            organizationId: verified.assignment.organizationId,
            assignmentId: verified.assignment.id,
            createdById: principal.userAccountId,
            status: scheduledAt ? ConsultationStatus.scheduled : ConsultationStatus.requested,
            purpose: dto.purpose.trim(),
            consentRecordId: verified.providerSharingConsent.id,
            requestedForAt,
            scheduledAt,
          },
        });

        await this.auditService.record(
          {
            actorId: principal.userAccountId,
            actorType: ActorType.user,
            action: 'consultation.create',
            resourceType: 'consultation',
            resourceId: created.id,
            outcome: AuditOutcome.succeeded,
            organizationId: verified.assignment.organizationId,
            purposeCode: 'provider_data_sharing',
            metadata: {
              initiated_by: 'provider',
              citizen_user_id: targetCitizenId,
              status: created.status,
            },
          },
          tx,
        );

        return this.toConsultationView(created);
      });
    }

    // Citizen-requested consultation path
    if (dto.citizen_user_id && dto.citizen_user_id !== principal.userAccountId) {
      await this.accessPolicy.assertOwnerOrThrowNotFound(
        dto.citizen_user_id,
        principal.userAccountId,
        {
          resourceType: 'citizen_record',
          resourceId: dto.citizen_user_id,
          action: 'consultation.create',
        },
      );
    }

    this.accessPolicy.assertCitizenSelf(principal);

    if (!dto.provider_user_id) {
      throw new ValidationDomainException(
        'provider_user_id is required when requesting a consultation.',
        [{ field: 'provider_user_id', reason: 'required' }],
      );
    }

    const consent = await this.consentService.requireActiveConsent(
      principal.userAccountId,
      'provider_data_sharing',
      'v1',
    );

    const resolvedProvider = await this.resolveProviderAndOrganizationForConsultation(
      dto.provider_user_id,
      dto.organization_id,
      principal.userAccountId,
    );

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.consultation.create({
        data: {
          citizenUserId: principal.userAccountId,
          providerUserId: dto.provider_user_id as string,
          organizationId: resolvedProvider.organizationId,
          assignmentId: resolvedProvider.assignmentId,
          createdById: principal.userAccountId,
          status: ConsultationStatus.requested,
          purpose: dto.purpose.trim(),
          consentRecordId: consent.id,
          requestedForAt: dto.requested_for_at ? new Date(dto.requested_for_at) : null,
          scheduledAt: null,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'consultation.create',
          resourceType: 'consultation',
          resourceId: created.id,
          outcome: AuditOutcome.succeeded,
          organizationId: resolvedProvider.organizationId,
          purposeCode: 'provider_data_sharing',
          metadata: {
            initiated_by: 'citizen',
            provider_user_id: created.providerUserId,
            status: created.status,
          },
        },
        tx,
      );

      return this.toConsultationView(created);
    });
  }

  async listConsultations(
    principal: AuthenticatedPrincipal,
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<ConsultationView>> {
    const limit = Math.min(Math.max(1, pagination.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const cursorFilter = this.buildConsultationCursorFilter(pagination.cursor);

    const authorizedCitizenIdsForProvider =
      await this.resolveCurrentlyAuthorizedCitizenIds(principal);

    const visibilityBranches: Prisma.ConsultationWhereInput[] = [
      { citizenUserId: principal.userAccountId },
    ];
    if (authorizedCitizenIdsForProvider.length > 0) {
      visibilityBranches.push({
        providerUserId: principal.userAccountId,
        citizenUserId: { in: authorizedCitizenIdsForProvider },
      });
    }

    const rows = await this.prisma.consultation.findMany({
      where: {
        OR: visibilityBranches,
        ...(cursorFilter ? { AND: [cursorFilter] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((row) => this.toConsultationView(row));
    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.created_at,
    }));
  }

  async getConsultationById(
    principal: AuthenticatedPrincipal,
    consultationId: string,
  ): Promise<ConsultationView> {
    if (!UUID_REGEX.test(consultationId)) {
      throw new ResourceNotFoundException();
    }

    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) {
      throw new ResourceNotFoundException();
    }

    if (consultation.citizenUserId === principal.userAccountId) {
      return this.toConsultationView(consultation);
    }

    if (
      consultation.providerUserId === principal.userAccountId &&
      (principal.roles.includes(RoleCode.provider) ||
        principal.roles.includes(RoleCode.community_health_worker))
    ) {
      await this.accessPolicy.verifyProviderAccessToCitizen({
        principal,
        citizenUserId: consultation.citizenUserId,
        requiredScope: 'view_summary',
      });
      return this.toConsultationView(consultation);
    }

    await this.accessPolicy.assertOwnerOrThrowNotFound(
      consultation.citizenUserId,
      principal.userAccountId,
      {
        resourceType: 'consultation',
        resourceId: consultationId,
        action: 'consultation.read',
      },
    );
    return this.toConsultationView(consultation);
  }

  async updateConsultationStatus(
    principal: AuthenticatedPrincipal,
    consultationId: string,
    dto: UpdateConsultationStatusDto,
  ): Promise<ConsultationView> {
    if (!UUID_REGEX.test(consultationId)) {
      throw new ResourceNotFoundException();
    }

    const existing = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!existing) {
      throw new ResourceNotFoundException();
    }

    const isCitizenOwner = existing.citizenUserId === principal.userAccountId;
    if (isCitizenOwner) {
      if (dto.status !== ConsultationStatus.cancelled) {
        throw new ForbiddenOperationException(
          'Citizens may only cancel their own consultation requests.',
        );
      }
    } else if (
      existing.providerUserId === principal.userAccountId &&
      (principal.roles.includes(RoleCode.provider) ||
        principal.roles.includes(RoleCode.community_health_worker))
    ) {
      await this.accessPolicy.verifyProviderAccessToCitizen({
        principal,
        citizenUserId: existing.citizenUserId,
        requiredScope: 'initiate_consultation',
      });
    } else {
      await this.accessPolicy.assertOwnerOrThrowNotFound(
        existing.citizenUserId,
        principal.userAccountId,
        {
          resourceType: 'consultation',
          resourceId: consultationId,
          action: 'consultation.update',
        },
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.consultation.update({
        where: { id: consultationId },
        data: {
          status: dto.status,
          ...(dto.scheduled_at !== undefined
            ? { scheduledAt: dto.scheduled_at ? new Date(dto.scheduled_at) : null }
            : {}),
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'consultation.status_update',
          resourceType: 'consultation',
          resourceId: updated.id,
          outcome: AuditOutcome.succeeded,
          organizationId: updated.organizationId,
          purposeCode: 'provider_data_sharing',
          metadata: {
            previous_status: existing.status,
            new_status: updated.status,
          },
        },
        tx,
      );

      return this.toConsultationView(updated);
    });
  }

  // ============================================================================
  // Scoped Provider Portal (FR-031 – FR-033, T-034, T-044)
  // ============================================================================

  async listAssignedCitizens(
    principal: AuthenticatedPrincipal,
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<AssignedCitizenSummaryView>> {
    if (!this.config.featureProviderPortalEnabled) {
      await this.auditService.record({
        actorId: principal.userAccountId,
        actorType: ActorType.user,
        action: 'provider.assigned_citizens.list',
        resourceType: 'provider_assignment',
        outcome: AuditOutcome.denied,
        purposeCode: 'provider_data_sharing',
        metadata: {
          reason: 'feature_provider_portal_disabled',
        },
      });
      throw new FeatureDisabledException(
        'Provider portal workflows are currently disabled by platform governance.',
      );
    }

    const holdsProviderRole =
      principal.roles.includes(RoleCode.provider) ||
      principal.roles.includes(RoleCode.community_health_worker);
    if (!holdsProviderRole) {
      await this.auditService.record({
        actorId: principal.userAccountId,
        actorType: ActorType.user,
        action: 'provider.assigned_citizens.list',
        resourceType: 'provider_assignment',
        outcome: AuditOutcome.denied,
        purposeCode: 'provider_data_sharing',
        metadata: {
          reason: 'missing_provider_role',
        },
      });
      throw new ForbiddenOperationException(
        'Provider or community health worker role is required.',
      );
    }

    const limit = Math.min(Math.max(1, pagination.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const now = new Date();
    const cursorFilter = this.buildAssignmentCursorFilter(pagination.cursor);

    const candidateAssignments = await this.prisma.providerAssignment.findMany({
      where: {
        providerUserId: principal.userAccountId,
        status: AssignmentStatus.active,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        citizenUser: {
          accountStatus: AccountStatus.active,
        },
        organization: {
          status: OrganizationStatus.active,
          memberships: {
            some: {
              userAccountId: principal.userAccountId,
              status: MembershipStatus.active,
              startedAt: { lte: now },
              OR: [{ endedAt: null }, { endedAt: { gt: now } }],
              roleCode: {
                in: [RoleCode.provider, RoleCode.community_health_worker],
              },
            },
          },
        },
        ...(cursorFilter ? { AND: [cursorFilter] } : {}),
      },
      include: {
        organization: true,
        citizenUser: {
          include: {
            profile: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const consentedItems: Array<{
      view: AssignedCitizenSummaryView;
      createdAtIso: string;
    }> = [];

    for (const assignment of candidateAssignments) {
      const sharingConsent = await this.consentService.verifyActiveConsent(
        assignment.citizenUserId,
        'provider_data_sharing',
        'v1',
      );
      if (!sharingConsent) {
        continue;
      }

      consentedItems.push({
        createdAtIso: assignment.createdAt.toISOString(),
        view: {
          assignment_id: assignment.id,
          citizen_user_id: assignment.citizenUserId,
          display_name: assignment.citizenUser.profile?.displayName ?? null,
          administrative_area_code: assignment.citizenUser.profile?.administrativeAreaCode ?? null,
          organization_id: assignment.organizationId,
          organization_name: assignment.organization.name,
          allowed_scopes: assignment.allowedScopes,
          starts_at: assignment.startsAt.toISOString(),
          ends_at: assignment.endsAt ? assignment.endsAt.toISOString() : null,
        },
      });

      if (consentedItems.length > limit) {
        break;
      }
    }

    const sortMap = new Map(
      consentedItems.map((entry) => [entry.view.assignment_id, entry.createdAtIso]),
    );
    const paginated = paginateItems(
      consentedItems.map((entry) => entry.view),
      limit,
      (item) => ({
        id: item.assignment_id,
        sortValue: sortMap.get(item.assignment_id) ?? item.starts_at,
      }),
    );

    await this.auditService.record({
      actorId: principal.userAccountId,
      actorType: ActorType.user,
      action: 'provider.assigned_citizens.list',
      resourceType: 'provider_assignment',
      outcome: AuditOutcome.allowed,
      purposeCode: 'provider_data_sharing',
      metadata: {
        returned_count: paginated.items.length,
      },
    });

    return paginated;
  }

  async getCitizenOverviewForProvider(
    principal: AuthenticatedPrincipal,
    citizenId: string,
  ): Promise<ProviderCitizenOverviewView> {
    const verified = await this.accessPolicy.verifyProviderAccessToCitizen({
      principal,
      citizenUserId: citizenId,
      requiredScope: 'view_summary',
    });

    const [citizen, activeHealthInputsCount, latestAssessment, recentFollowUpsCount] =
      await Promise.all([
        this.prisma.userAccount.findUniqueOrThrow({
          where: { id: citizenId },
          include: { profile: true },
        }),
        this.prisma.healthInput.count({
          where: {
            userAccountId: citizenId,
            status: 'active',
          },
        }),
        this.prisma.riskAssessment.findFirst({
          where: {
            userAccountId: citizenId,
            status: { in: ['complete', 'limited'] },
          },
          include: {
            riskUseCase: true,
            ruleModelVersion: true,
          },
          orderBy: [{ createdAt: 'desc' }],
        }),
        this.prisma.providerFollowUp.count({
          where: {
            citizenUserId: citizenId,
          },
        }),
      ]);

    await this.auditService.record({
      actorId: principal.userAccountId,
      actorType: ActorType.user,
      action: 'provider.citizen.overview.read',
      resourceType: 'citizen_record',
      resourceId: citizenId,
      outcome: AuditOutcome.allowed,
      organizationId: verified.assignment.organizationId,
      purposeCode: 'provider_data_sharing',
      metadata: {
        assignment_id: verified.assignment.id,
        required_scope: 'view_summary',
      },
    });

    return {
      citizen_user_id: citizenId,
      assignment_id: verified.assignment.id,
      organization_id: verified.assignment.organizationId,
      allowed_scopes: verified.assignment.allowedScopes,
      profile: {
        display_name: citizen.profile?.displayName ?? null,
        birth_year: citizen.profile?.birthYear ?? null,
        administrative_area_code: citizen.profile?.administrativeAreaCode ?? null,
        preferred_language: citizen.preferredLanguage,
      },
      active_health_inputs_count: activeHealthInputsCount,
      latest_risk_assessment: latestAssessment
        ? {
            id: latestAssessment.id,
            use_case_code: latestAssessment.riskUseCase.code,
            status: latestAssessment.status,
            level: latestAssessment.level,
            rule_model_version: latestAssessment.ruleModelVersion.version,
            calculated_at: latestAssessment.calculatedAt
              ? latestAssessment.calculatedAt.toISOString()
              : null,
            limitations: latestAssessment.limitations,
            non_diagnostic_notice: PROVIDER_RISK_NON_DIAGNOSTIC_NOTICE,
          }
        : null,
      recent_follow_ups_count: recentFollowUpsCount,
      provenance_notice:
        'Citizen lifestyle inputs are self-reported unless explicitly marked otherwise, and risk indicators are deterministic preventive rules rather than clinical diagnoses.',
    };
  }

  async listCitizenHealthInputsForProvider(
    principal: AuthenticatedPrincipal,
    citizenId: string,
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<ProviderHealthInputView>> {
    const verified = await this.accessPolicy.verifyProviderAccessToCitizen({
      principal,
      citizenUserId: citizenId,
      requiredScope: 'view_health_inputs',
    });

    const limit = Math.min(Math.max(1, pagination.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const cursorFilter = this.buildHealthInputCursorFilter(pagination.cursor);

    const rows = await this.prisma.healthInput.findMany({
      where: {
        userAccountId: citizenId,
        ...(cursorFilter ? { AND: [cursorFilter] } : {}),
      },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const nowMs = Date.now();
    const mapped = rows.map((row) => this.toProviderHealthInputView(row, nowMs));
    const paginated = paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.observed_at,
    }));

    await this.auditService.record({
      actorId: principal.userAccountId,
      actorType: ActorType.user,
      action: 'provider.citizen.health_inputs.read',
      resourceType: 'citizen_record',
      resourceId: citizenId,
      outcome: AuditOutcome.allowed,
      organizationId: verified.assignment.organizationId,
      purposeCode: 'provider_data_sharing',
      metadata: {
        assignment_id: verified.assignment.id,
        required_scope: 'view_health_inputs',
        returned_count: paginated.items.length,
      },
    });

    return paginated;
  }

  async listCitizenRiskAssessmentsForProvider(
    principal: AuthenticatedPrincipal,
    citizenId: string,
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<ProviderRiskAssessmentView>> {
    const verified = await this.accessPolicy.verifyProviderAccessToCitizen({
      principal,
      citizenUserId: citizenId,
      requiredScope: 'view_risk_assessments',
    });

    const limit = Math.min(Math.max(1, pagination.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const cursorFilter = this.buildRiskAssessmentCursorFilter(pagination.cursor);

    const rows = await this.prisma.riskAssessment.findMany({
      where: {
        userAccountId: citizenId,
        ...(cursorFilter ? { AND: [cursorFilter] } : {}),
      },
      include: {
        riskUseCase: true,
        ruleModelVersion: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const nowMs = Date.now();
    const mapped = rows.map((row) => this.toProviderRiskAssessmentView(row, nowMs));
    const sortMap = new Map(rows.map((r) => [r.id, r.createdAt.toISOString()]));
    const paginated = paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: sortMap.get(item.id) ?? item.calculated_at ?? new Date(0).toISOString(),
    }));

    await this.auditService.record({
      actorId: principal.userAccountId,
      actorType: ActorType.user,
      action: 'provider.citizen.risk_assessments.read',
      resourceType: 'citizen_record',
      resourceId: citizenId,
      outcome: AuditOutcome.allowed,
      organizationId: verified.assignment.organizationId,
      purposeCode: 'provider_data_sharing',
      metadata: {
        assignment_id: verified.assignment.id,
        required_scope: 'view_risk_assessments',
        returned_count: paginated.items.length,
      },
    });

    return paginated;
  }

  async createProviderFollowUp(
    principal: AuthenticatedPrincipal,
    citizenId: string,
    dto: CreateProviderFollowUpDto,
  ): Promise<ProviderFollowUpView> {
    const verified = await this.accessPolicy.verifyProviderAccessToCitizen({
      principal,
      citizenUserId: citizenId,
      requiredScope: 'record_follow_up',
    });

    const sanitizedStructuredNotes = this.validateAndNormalizeStructuredNotes(dto.structured_notes);

    if (dto.referenced_assessment_id) {
      const assessment = await this.prisma.riskAssessment.findFirst({
        where: {
          id: dto.referenced_assessment_id,
          userAccountId: citizenId,
        },
      });
      if (!assessment) {
        throw new ValidationDomainException(
          'referenced_assessment_id must belong to the target assigned citizen.',
          [{ field: 'referenced_assessment_id', reason: 'invalid_assessment_reference' }],
        );
      }
    }

    // Strictly append to `provider_follow_ups` + `audit_events` ONLY — NEVER mutate `health_inputs` or `risk_assessments` (FR-033)
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.providerFollowUp.create({
        data: {
          assignmentId: verified.assignment.id,
          providerUserId: principal.userAccountId,
          citizenUserId: citizenId,
          referencedAssessmentId: dto.referenced_assessment_id ?? null,
          actionType: dto.action_type,
          structuredNotes: sanitizedStructuredNotes as Prisma.InputJsonValue,
          recommendedFollowUpAt: dto.recommended_follow_up_at
            ? new Date(dto.recommended_follow_up_at)
            : null,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'provider.citizen.follow_up.create',
          resourceType: 'provider_follow_up',
          resourceId: created.id,
          outcome: AuditOutcome.succeeded,
          organizationId: verified.assignment.organizationId,
          purposeCode: 'provider_data_sharing',
          metadata: {
            assignment_id: verified.assignment.id,
            citizen_user_id: citizenId,
            action_type: created.actionType,
            referenced_assessment_id: created.referencedAssessmentId,
          },
        },
        tx,
      );

      return this.toProviderFollowUpView(created);
    });
  }

  async listProviderFollowUps(
    principal: AuthenticatedPrincipal,
    citizenId: string,
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<ProviderFollowUpView>> {
    const scopeToVerify = await this.resolveFollowUpReadScope(principal.userAccountId, citizenId);
    const verified = await this.accessPolicy.verifyProviderAccessToCitizen({
      principal,
      citizenUserId: citizenId,
      requiredScope: scopeToVerify,
    });

    const limit = Math.min(Math.max(1, pagination.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const cursorFilter = this.buildFollowUpCursorFilter(pagination.cursor);

    const rows = await this.prisma.providerFollowUp.findMany({
      where: {
        citizenUserId: citizenId,
        assignment: {
          organizationId: verified.assignment.organizationId,
        },
        ...(cursorFilter ? { AND: [cursorFilter] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((row) => this.toProviderFollowUpView(row));
    const paginated = paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.created_at,
    }));

    await this.auditService.record({
      actorId: principal.userAccountId,
      actorType: ActorType.user,
      action: 'provider.citizen.follow_ups.read',
      resourceType: 'citizen_record',
      resourceId: citizenId,
      outcome: AuditOutcome.allowed,
      organizationId: verified.assignment.organizationId,
      purposeCode: 'provider_data_sharing',
      metadata: {
        assignment_id: verified.assignment.id,
        required_scope: scopeToVerify,
        returned_count: paginated.items.length,
      },
    });

    return paginated;
  }

  // ============================================================================
  // Private Helpers & View Mappers
  // ============================================================================

  private validateAndNormalizeStructuredNotes(
    rawNotes: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!rawNotes || typeof rawNotes !== 'object' || Array.isArray(rawNotes)) {
      throw new ValidationDomainException('structured_notes must be a bounded JSON object.', [
        { field: 'structured_notes', reason: 'invalid_object' },
      ]);
    }

    const entries = Object.entries(rawNotes);
    if (entries.length === 0 || entries.length > 12) {
      throw new ValidationDomainException(
        'structured_notes must contain between 1 and 12 structured fields.',
        [{ field: 'structured_notes', reason: 'invalid_field_count' }],
      );
    }

    const normalized: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) {
        throw new ValidationDomainException(
          'structured_notes keys must use bounded snake_case identifiers.',
          [{ field: `structured_notes.${key}`, reason: 'invalid_key_format' }],
        );
      }

      if (val === null || typeof val === 'boolean' || typeof val === 'number') {
        normalized[key] = val;
      } else if (typeof val === 'string') {
        if (val.length > 500) {
          throw new ValidationDomainException(
            'structured_notes string values cannot exceed 500 characters.',
            [{ field: `structured_notes.${key}`, reason: 'too_long' }],
          );
        }
        normalized[key] = val.trim();
      } else if (
        Array.isArray(val) &&
        val.length <= 10 &&
        val.every((item) => typeof item === 'string' && item.length <= 120)
      ) {
        normalized[key] = val.map((item) => (item as string).trim());
      } else {
        throw new ValidationDomainException(
          'structured_notes values must be bounded primitives or short string lists.',
          [{ field: `structured_notes.${key}`, reason: 'unsupported_value_type' }],
        );
      }
    }

    return normalized;
  }

  private async resolveFollowUpReadScope(
    providerUserId: string,
    citizenUserId: string,
  ): Promise<string> {
    if (!UUID_REGEX.test(citizenUserId)) {
      return 'view_summary';
    }
    const now = new Date();
    const assignment = await this.prisma.providerAssignment.findFirst({
      where: {
        providerUserId,
        citizenUserId,
        status: AssignmentStatus.active,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    if (assignment?.allowedScopes.includes('view_summary')) {
      return 'view_summary';
    }
    if (assignment?.allowedScopes.includes('record_follow_up')) {
      return 'record_follow_up';
    }
    return 'view_summary';
  }

  private async assertActiveProviderTarget(
    providerUserId: string,
    requirePublicOrAssigned: boolean,
    citizenUserId?: string,
  ): Promise<void> {
    const providerAccount = await this.prisma.userAccount.findUnique({
      where: { id: providerUserId },
      include: {
        roles: { where: { revokedAt: null }, include: { role: true } },
        providerProfile: true,
      },
    });

    if (!providerAccount || providerAccount.accountStatus !== AccountStatus.active) {
      throw new ResourceNotFoundException('Target provider was not found.');
    }

    const activeRoles = providerAccount.roles.map((r) => r.role.code);
    const isProviderOrChw =
      activeRoles.includes(RoleCode.provider) ||
      activeRoles.includes(RoleCode.community_health_worker);
    if (!isProviderOrChw) {
      throw new ResourceNotFoundException('Target provider was not found.');
    }

    if (requirePublicOrAssigned) {
      if (providerAccount.providerProfile?.publicDirectoryVisible) {
        return;
      }
      if (citizenUserId) {
        const now = new Date();
        const assignment = await this.prisma.providerAssignment.findFirst({
          where: {
            providerUserId,
            citizenUserId,
            status: AssignmentStatus.active,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gte: now } }],
          },
        });
        if (assignment) {
          return;
        }
      }
      throw new ResourceNotFoundException('Target provider was not found.');
    }
  }

  private async resolveProviderAndOrganizationForConsultation(
    providerUserId: string,
    explicitOrgId: string | undefined,
    citizenUserId: string,
  ): Promise<{ organizationId: string; assignmentId: string | null }> {
    await this.assertActiveProviderTarget(providerUserId, true, citizenUserId);

    const now = new Date();
    const existingAssignment = await this.prisma.providerAssignment.findFirst({
      where: {
        providerUserId,
        citizenUserId,
        status: AssignmentStatus.active,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        ...(explicitOrgId ? { organizationId: explicitOrgId } : {}),
        organization: { status: OrganizationStatus.active },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    if (existingAssignment) {
      return {
        organizationId: existingAssignment.organizationId,
        assignmentId: existingAssignment.id,
      };
    }

    const providerProfile = await this.prisma.providerProfile.findUnique({
      where: { userAccountId: providerUserId },
      include: { organization: true },
    });

    if (explicitOrgId) {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          organizationId: explicitOrgId,
          userAccountId: providerUserId,
          status: MembershipStatus.active,
          organization: { status: OrganizationStatus.active },
        },
      });
      if (!membership && providerProfile?.organizationId !== explicitOrgId) {
        throw new ResourceNotFoundException(
          'Active provider organization for consultation was not found.',
        );
      }
      const org = await this.prisma.organization.findFirst({
        where: { id: explicitOrgId, status: OrganizationStatus.active },
      });
      if (!org) {
        throw new ResourceNotFoundException('Active organization was not found.');
      }
      return { organizationId: org.id, assignmentId: null };
    }

    if (
      providerProfile?.organizationId &&
      providerProfile.organization?.status === OrganizationStatus.active
    ) {
      return {
        organizationId: providerProfile.organizationId,
        assignmentId: null,
      };
    }

    const activeMembership = await this.prisma.organizationMembership.findFirst({
      where: {
        userAccountId: providerUserId,
        status: MembershipStatus.active,
        organization: { status: OrganizationStatus.active },
      },
      orderBy: [{ startedAt: 'desc' }],
    });

    if (activeMembership) {
      return {
        organizationId: activeMembership.organizationId,
        assignmentId: null,
      };
    }

    throw new ValidationDomainException(
      'Target provider does not have an active healthcare organization for consultation routing.',
      [{ field: 'organization_id', reason: 'active_organization_required' }],
    );
  }

  private async resolveCurrentlyAuthorizedCitizenIds(
    principal: AuthenticatedPrincipal,
  ): Promise<string[]> {
    if (!this.config.featureProviderPortalEnabled) {
      return [];
    }
    const isProviderOrChw =
      principal.roles.includes(RoleCode.provider) ||
      principal.roles.includes(RoleCode.community_health_worker);
    if (!isProviderOrChw) {
      return [];
    }

    const now = new Date();
    const assignments = await this.prisma.providerAssignment.findMany({
      where: {
        providerUserId: principal.userAccountId,
        status: AssignmentStatus.active,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        citizenUser: { accountStatus: AccountStatus.active },
        organization: {
          status: OrganizationStatus.active,
          memberships: {
            some: {
              userAccountId: principal.userAccountId,
              status: MembershipStatus.active,
              startedAt: { lte: now },
              OR: [{ endedAt: null }, { endedAt: { gt: now } }],
            },
          },
        },
      },
      select: { citizenUserId: true },
    });

    const uniqueCitizenIds = Array.from(new Set(assignments.map((a) => a.citizenUserId)));
    const consentedIds: string[] = [];
    for (const cid of uniqueCitizenIds) {
      const consent = await this.consentService.verifyActiveConsent(
        cid,
        'provider_data_sharing',
        'v1',
      );
      if (consent) {
        consentedIds.push(cid);
      }
    }
    return consentedIds;
  }

  private toFacilityView(facility: FacilityWithRelations, distanceKm: number | null): FacilityView {
    return {
      id: facility.id,
      name: facility.name,
      facility_type: facility.facilityType,
      status: facility.status,
      address: facility.address,
      administrative_area_code: facility.administrativeAreaCode,
      latitude: facility.latitude,
      longitude: facility.longitude,
      distance_km: distanceKm,
      contact_phone: facility.contactPhone,
      contact_email: facility.contactEmail,
      opening_hours_summary: facility.openingHoursSummary,
      source_name: facility.dataSource.name,
      source_reference: facility.sourceReference,
      last_verified_at: facility.lastVerifiedAt.toISOString(),
      verification_note: facility.verificationNote,
      availability_caveat: CLINICAL_AVAILABILITY_CAVEAT,
      services: facility.services.map((svc) => ({
        id: svc.id,
        service_code: svc.serviceCode,
        service_name: svc.serviceName,
        status: svc.status,
        last_verified_at: svc.lastVerifiedAt.toISOString(),
      })),
    };
  }

  private toReferralView(row: Referral): ReferralView {
    return {
      id: row.id,
      citizen_user_id: row.citizenUserId,
      provider_user_id: row.providerUserId,
      facility_id: row.facilityId,
      created_by_id: row.createdById,
      type: row.type,
      status: row.status,
      purpose: row.purpose,
      consent_record_id: row.consentRecordId,
      scheduled_at: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      notes_summary: row.notesSummary,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private toConsultationView(row: Consultation): ConsultationView {
    return {
      id: row.id,
      citizen_user_id: row.citizenUserId,
      provider_user_id: row.providerUserId,
      organization_id: row.organizationId,
      assignment_id: row.assignmentId,
      created_by_id: row.createdById,
      status: row.status,
      purpose: row.purpose,
      consent_record_id: row.consentRecordId,
      requested_for_at: row.requestedForAt ? row.requestedForAt.toISOString() : null,
      scheduled_at: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      workflow_mode: 'scheduling_and_request_only',
      workflow_notice:
        'First-release consultation workflows coordinate visit requests and scheduling only; live video consultations are out of scope (PROJECT_SCOPE.md §4).',
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private toProviderHealthInputView(row: HealthInput, nowMs: number): ProviderHealthInputView {
    const ageHours = Math.max(
      0,
      Math.round(((nowMs - row.observedAt.getTime()) / (1000 * 60 * 60)) * 10) / 10,
    );
    return {
      id: row.id,
      category: row.category,
      field_code: row.fieldCode,
      numeric_value: row.numericValue,
      text_value: row.textValue,
      unit: row.unit,
      source_type: row.sourceType,
      source_reference: row.sourceReference,
      observed_at: row.observedAt.toISOString(),
      age_hours: ageHours,
      status: row.status,
      supersedes_input_id: row.supersedesInputId,
      provenance_note:
        row.sourceType === 'self_reported'
          ? 'Self-reported by citizen; not clinically confirmed.'
          : `Recorded via ${row.sourceType}.`,
    };
  }

  private toProviderRiskAssessmentView(
    row: RiskAssessment & { riskUseCase: RiskUseCase; ruleModelVersion: RuleModelVersion },
    nowMs: number,
  ): ProviderRiskAssessmentView {
    const ageHours = row.calculatedAt
      ? Math.max(0, Math.round(((nowMs - row.calculatedAt.getTime()) / (1000 * 60 * 60)) * 10) / 10)
      : null;

    return {
      id: row.id,
      use_case_code: row.riskUseCase.code,
      status: row.status,
      level: row.level,
      rule_model_version: row.ruleModelVersion.version,
      calculated_at: row.calculatedAt ? row.calculatedAt.toISOString() : null,
      age_hours: ageHours,
      contributing_factors: row.contributingFactors,
      limitations: row.limitations,
      recommended_next_steps: row.recommendedNextSteps,
      input_snapshot_id: row.inputSnapshotId,
      non_diagnostic_notice: PROVIDER_RISK_NON_DIAGNOSTIC_NOTICE,
    };
  }

  private toProviderFollowUpView(row: ProviderFollowUp): ProviderFollowUpView {
    return {
      id: row.id,
      assignment_id: row.assignmentId,
      provider_user_id: row.providerUserId,
      citizen_user_id: row.citizenUserId,
      referenced_assessment_id: row.referencedAssessmentId,
      action_type: row.actionType,
      structured_notes: (row.structuredNotes ?? {}) as Record<string, unknown>,
      recommended_follow_up_at: row.recommendedFollowUpAt
        ? row.recommendedFollowUpAt.toISOString()
        : null,
      source_type: 'provider_recorded',
      created_at: row.createdAt.toISOString(),
    };
  }

  private buildFacilityCursorFilter(cursor?: string): Prisma.FacilityWhereInput | undefined {
    if (!cursor) return undefined;
    const decoded = decodeCursor(cursor);
    const sortDate = new Date(decoded.sortValue);
    if (Number.isNaN(sortDate.getTime())) return undefined;
    return {
      OR: [{ createdAt: { lt: sortDate } }, { createdAt: sortDate, id: { lt: decoded.id } }],
    };
  }

  private buildProviderProfileCursorFilter(
    cursor?: string,
  ): Prisma.ProviderProfileWhereInput | undefined {
    if (!cursor) return undefined;
    const decoded = decodeCursor(cursor);
    const sortDate = new Date(decoded.sortValue);
    if (Number.isNaN(sortDate.getTime())) return undefined;
    return {
      OR: [{ createdAt: { lt: sortDate } }, { createdAt: sortDate, id: { lt: decoded.id } }],
    };
  }

  private buildReferralCursorFilter(cursor?: string): Prisma.ReferralWhereInput | undefined {
    if (!cursor) return undefined;
    const decoded = decodeCursor(cursor);
    const sortDate = new Date(decoded.sortValue);
    if (Number.isNaN(sortDate.getTime())) return undefined;
    return {
      OR: [{ createdAt: { lt: sortDate } }, { createdAt: sortDate, id: { lt: decoded.id } }],
    };
  }

  private buildConsultationCursorFilter(
    cursor?: string,
  ): Prisma.ConsultationWhereInput | undefined {
    if (!cursor) return undefined;
    const decoded = decodeCursor(cursor);
    const sortDate = new Date(decoded.sortValue);
    if (Number.isNaN(sortDate.getTime())) return undefined;
    return {
      OR: [{ createdAt: { lt: sortDate } }, { createdAt: sortDate, id: { lt: decoded.id } }],
    };
  }

  private buildAssignmentCursorFilter(
    cursor?: string,
  ): Prisma.ProviderAssignmentWhereInput | undefined {
    if (!cursor) return undefined;
    const decoded = decodeCursor(cursor);
    const sortDate = new Date(decoded.sortValue);
    if (Number.isNaN(sortDate.getTime())) return undefined;
    return {
      OR: [{ createdAt: { lt: sortDate } }, { createdAt: sortDate, id: { lt: decoded.id } }],
    };
  }

  private buildHealthInputCursorFilter(cursor?: string): Prisma.HealthInputWhereInput | undefined {
    if (!cursor) return undefined;
    const decoded = decodeCursor(cursor);
    const sortDate = new Date(decoded.sortValue);
    if (Number.isNaN(sortDate.getTime())) return undefined;
    return {
      OR: [{ observedAt: { lt: sortDate } }, { observedAt: sortDate, id: { lt: decoded.id } }],
    };
  }

  private buildRiskAssessmentCursorFilter(
    cursor?: string,
  ): Prisma.RiskAssessmentWhereInput | undefined {
    if (!cursor) return undefined;
    const decoded = decodeCursor(cursor);
    const sortDate = new Date(decoded.sortValue);
    if (Number.isNaN(sortDate.getTime())) return undefined;
    return {
      OR: [{ createdAt: { lt: sortDate } }, { createdAt: sortDate, id: { lt: decoded.id } }],
    };
  }

  private buildFollowUpCursorFilter(
    cursor?: string,
  ): Prisma.ProviderFollowUpWhereInput | undefined {
    if (!cursor) return undefined;
    const decoded = decodeCursor(cursor);
    const sortDate = new Date(decoded.sortValue);
    if (Number.isNaN(sortDate.getTime())) return undefined;
    return {
      OR: [{ createdAt: { lt: sortDate } }, { createdAt: sortDate, id: { lt: decoded.id } }],
    };
  }
}
