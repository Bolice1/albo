import { Injectable } from '@nestjs/common';
import {
  ActorType,
  AuditOutcome,
  CheckInSafetyStatus,
  DataSourceType,
  HealthInput,
  HealthInputStatus,
  Prisma,
  WellbeingCheckIn,
} from '@prisma/client';
import { AppConfigService } from '@config/app-config.service';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import {
  ConflictDomainException,
  FeatureDisabledException,
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
import {
  buildDeterministicCrisisEscalationCard,
  CrisisEscalationCard,
} from '@common/safety/crisis-escalation.util';
import { PrismaService } from '@database/prisma.service';
import { AiServiceClient } from '@integrations/ai-service/ai-service.client';
import { AuditService } from '@modules/audit/audit.service';
import { ConsentService } from '@modules/consent/consent.service';
import { FacilitiesCareService } from '@modules/facilities-care/facilities-care.service';
import { AccessPolicyService } from '@modules/identity-access/access-policy.service';
import {
  CreateCheckInDto,
  CreateHealthInputDto,
  ListHealthInputsQueryDto,
  SupersedeHealthInputDto,
} from './dto/health-profile.dto';
import { validateAllowlistedHealthInput } from './field-allowlist';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface HealthInputView {
  id: string;
  user_account_id: string;
  category: string;
  field_code: string;
  value: number | string | null;
  numeric_value: number | null;
  text_value: string | null;
  unit: string | null;
  observed_at: string;
  source_type: DataSourceType;
  source_reference: string | null;
  status: HealthInputStatus;
  supersedes_input_id: string | null;
  consent_record_id: string;
  created_at: string;
  updated_at: string;
}

export interface WellbeingCheckInView {
  id: string;
  user_account_id: string;
  questionnaire_version: string;
  responses: Record<string, number>;
  completed_at: string;
  source_type: DataSourceType;
  safety_status: CheckInSafetyStatus;
  escalation_required: boolean;
  escalation_category: string | null;
  non_diagnostic_disclaimer: string;
  crisis_escalation: CrisisEscalationCard | null;
  created_at: string;
}

const CHECK_IN_NON_DIAGNOSTIC_DISCLAIMER =
  'Wellbeing check-ins support personal reflection and preventive awareness only. They are not a clinical or mental-health diagnosis.';

@Injectable()
export class HealthProfileService {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly consentService: ConsentService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly auditService: AuditService,
    private readonly aiServiceClient: AiServiceClient,
    private readonly facilitiesCareService: FacilitiesCareService,
  ) {}

  async listHealthInputs(
    principal: AuthenticatedPrincipal,
    query: ListHealthInputsQueryDto,
  ): Promise<PaginatedResult<HealthInputView>> {
    this.accessPolicy.assertCitizenSelf(principal);

    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const cursorFilter = this.buildHealthInputCursorFilter(query.cursor);
    const statusFilter =
      query.status === 'all' ? undefined : (query.status ?? HealthInputStatus.active);

    const rows = await this.prisma.healthInput.findMany({
      where: {
        userAccountId: principal.userAccountId,
        ...(query.field_code ? { fieldCode: query.field_code } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(cursorFilter ? { AND: [cursorFilter] } : {}),
      },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((row) => this.toHealthInputView(row));
    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.observed_at,
    }));
  }

  async getHealthInputById(
    principal: AuthenticatedPrincipal,
    inputId: string,
  ): Promise<HealthInputView> {
    this.accessPolicy.assertCitizenSelf(principal);
    if (!UUID_REGEX.test(inputId)) {
      throw new ResourceNotFoundException();
    }

    const row = await this.prisma.healthInput.findUnique({
      where: { id: inputId },
    });
    if (!row) {
      throw new ResourceNotFoundException();
    }

    await this.accessPolicy.assertOwnerOrThrowNotFound(row.userAccountId, principal.userAccountId, {
      resourceType: 'health_input',
      resourceId: inputId,
      action: 'health_input.read',
    });

    return this.toHealthInputView(row);
  }

  async createHealthInput(
    principal: AuthenticatedPrincipal,
    dto: CreateHealthInputDto,
  ): Promise<HealthInputView> {
    this.accessPolicy.assertCitizenSelf(principal);

    const consentRecord = await this.consentService.requireActiveConsent(
      principal.userAccountId,
      'health_input_storage',
      'v1',
    );

    const validated = validateAllowlistedHealthInput({
      fieldCode: dto.field_code,
      category: dto.category,
      value: dto.value,
      numericValue: dto.numeric_value,
      textValue: dto.text_value,
      unit: dto.unit,
      observedAt: dto.observed_at,
    });

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.healthInput.create({
        data: {
          userAccountId: principal.userAccountId,
          category: validated.category,
          fieldCode: validated.fieldCode,
          numericValue: validated.numericValue,
          textValue: validated.textValue,
          unit: validated.unit,
          observedAt: validated.observedAt,
          sourceType: DataSourceType.self_reported,
          sourceReference: dto.source_reference ?? null,
          status: HealthInputStatus.active,
          consentRecordId: consentRecord.id,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'health_input.create',
          resourceType: 'health_input',
          resourceId: created.id,
          outcome: AuditOutcome.succeeded,
          purposeCode: 'health_input_storage',
          metadata: {
            field_code: created.fieldCode,
            category: created.category,
            source_type: created.sourceType,
          },
        },
        tx,
      );

      return this.toHealthInputView(created);
    });
  }

  /**
   * Immutable correction via supersession (ADR-017, SYSTEM_DESIGN.md §7, DATA_PRIVACY.md §9).
   * Marks the prior row `superseded` and inserts a new `active` row referencing `supersedes_input_id`.
   */
  async supersedeHealthInput(
    principal: AuthenticatedPrincipal,
    inputId: string,
    dto: SupersedeHealthInputDto,
  ): Promise<HealthInputView> {
    this.accessPolicy.assertCitizenSelf(principal);

    if (!UUID_REGEX.test(inputId)) {
      throw new ResourceNotFoundException();
    }

    const existing = await this.prisma.healthInput.findUnique({
      where: { id: inputId },
    });

    if (!existing) {
      throw new ResourceNotFoundException();
    }

    await this.accessPolicy.assertOwnerOrThrowNotFound(
      existing.userAccountId,
      principal.userAccountId,
      {
        resourceType: 'health_input',
        resourceId: inputId,
        action: 'health_input.supersede',
      },
    );

    const consentRecord = await this.consentService.requireActiveConsent(
      principal.userAccountId,
      'health_input_storage',
      'v1',
    );

    if (existing.status !== HealthInputStatus.active) {
      throw new ConflictDomainException(
        'Only active health inputs can be corrected; superseded or retracted records are immutable.',
      );
    }

    if (dto.field_code !== undefined && dto.field_code !== existing.fieldCode) {
      throw new ValidationDomainException(
        'Cannot change field_code when correcting an existing health input.',
        [{ field: 'field_code', reason: 'immutable_field_code' }],
      );
    }

    const validated = validateAllowlistedHealthInput({
      fieldCode: existing.fieldCode,
      category: dto.category ?? existing.category,
      value: dto.value,
      numericValue: dto.numeric_value,
      textValue: dto.text_value,
      unit: dto.unit,
      defaultUnit: existing.unit,
      observedAt: dto.observed_at,
      defaultObservedAt: existing.observedAt,
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.healthInput.update({
        where: { id: existing.id },
        data: {
          status: HealthInputStatus.superseded,
        },
      });

      const replacement = await tx.healthInput.create({
        data: {
          userAccountId: principal.userAccountId,
          category: validated.category,
          fieldCode: validated.fieldCode,
          numericValue: validated.numericValue,
          textValue: validated.textValue,
          unit: validated.unit,
          observedAt: validated.observedAt,
          sourceType: DataSourceType.self_reported,
          sourceReference:
            dto.source_reference !== undefined ? dto.source_reference : existing.sourceReference,
          status: HealthInputStatus.active,
          supersedesInputId: existing.id,
          consentRecordId: consentRecord.id,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'health_input.supersede',
          resourceType: 'health_input',
          resourceId: replacement.id,
          outcome: AuditOutcome.succeeded,
          purposeCode: 'health_input_storage',
          metadata: {
            field_code: replacement.fieldCode,
            category: replacement.category,
            superseded_resource_id: existing.id,
          },
        },
        tx,
      );

      return this.toHealthInputView(replacement);
    });
  }

  async listCheckIns(
    principal: AuthenticatedPrincipal,
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<WellbeingCheckInView>> {
    this.assertCheckInsFeatureEnabled();
    this.accessPolicy.assertCitizenSelf(principal);

    const limit = Math.min(Math.max(1, pagination.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const cursorFilter = this.buildCheckInCursorFilter(pagination.cursor);

    const rows = await this.prisma.wellbeingCheckIn.findMany({
      where: {
        userAccountId: principal.userAccountId,
        ...(cursorFilter ? { AND: [cursorFilter] } : {}),
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((row) => this.toCheckInView(row, null));
    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.completed_at,
    }));
  }

  async createCheckIn(
    principal: AuthenticatedPrincipal,
    dto: CreateCheckInDto,
  ): Promise<WellbeingCheckInView> {
    this.assertCheckInsFeatureEnabled();
    this.accessPolicy.assertCitizenSelf(principal);

    const consentRecord = await this.consentService.requireActiveConsent(
      principal.userAccountId,
      'wellbeing_check_ins',
      'v1',
    );

    const now = new Date();
    const completedAt = dto.completed_at ? new Date(dto.completed_at) : now;
    if (
      Number.isNaN(completedAt.getTime()) ||
      completedAt.getTime() > now.getTime() + 5 * 60 * 1000
    ) {
      throw new ValidationDomainException('The request contains invalid fields.', [
        { field: 'completed_at', reason: 'invalid_or_future_timestamp' },
      ]);
    }

    const structuredResponses: Record<string, number> = {
      stress_frequency_score: dto.responses.stress_frequency_score,
      exhaustion_score: dto.responses.exhaustion_score,
      sleep_quality_score: dto.responses.sleep_quality_score,
      ...(dto.responses.self_harm_signal !== undefined
        ? { self_harm_signal: dto.responses.self_harm_signal }
        : {}),
    };

    const safetyResult = await this.aiServiceClient.evaluateCheckInSafety({
      questionnaire_version: dto.questionnaire_version,
      completed_at: completedAt.toISOString(),
      authorization_context: {
        consent_verified: true,
        consent_purpose_code: 'wellbeing_check_ins',
        consent_version: 'v1',
      },
      responses: structuredResponses,
      free_text_reflection: dto.free_text_reflection ?? null,
    });

    let crisisEscalation: CrisisEscalationCard | null = null;
    if (safetyResult.escalation_required) {
      const verifiedFacilities = await this.facilitiesCareService.findVerifiedFacilitiesByTags(
        safetyResult.recommended_facility_tags,
        4,
      );
      crisisEscalation = buildDeterministicCrisisEscalationCard(
        safetyResult.escalation_category,
        verifiedFacilities,
        safetyResult.escalation_guidance_key,
      );
    }

    const mappedSafetyStatus = this.mapCheckInSafetyStatus(safetyResult.safety_status);

    const created = await this.prisma.$transaction(async (tx) => {
      // Minimize retained data: store structured Likert scores only, never raw free-text trauma reflections
      const record = await tx.wellbeingCheckIn.create({
        data: {
          userAccountId: principal.userAccountId,
          questionnaireVersion: dto.questionnaire_version,
          responses: structuredResponses as Prisma.InputJsonValue,
          completedAt,
          sourceType: DataSourceType.self_reported,
          safetyStatus: mappedSafetyStatus,
          escalationRequired: safetyResult.escalation_required,
          escalationCategory: safetyResult.escalation_category ?? null,
          consentRecordId: consentRecord.id,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'wellbeing_check_in.submit',
          resourceType: 'wellbeing_check_in',
          resourceId: record.id,
          outcome: safetyResult.escalation_required
            ? AuditOutcome.escalated
            : AuditOutcome.succeeded,
          purposeCode: 'wellbeing_check_ins',
          metadata: {
            questionnaire_version: dto.questionnaire_version,
            safety_status: mappedSafetyStatus,
            escalation_required: safetyResult.escalation_required,
            escalation_category: safetyResult.escalation_category ?? null,
          },
        },
        tx,
      );

      return record;
    });

    return this.toCheckInView(
      created,
      crisisEscalation,
      safetyResult.non_diagnostic_disclaimer ?? CHECK_IN_NON_DIAGNOSTIC_DISCLAIMER,
    );
  }

  private assertCheckInsFeatureEnabled(): void {
    if (!this.config.featureCheckinsEnabled) {
      throw new FeatureDisabledException(
        'Structured wellbeing check-ins are currently disabled by platform governance.',
      );
    }
  }

  private mapCheckInSafetyStatus(status: string): CheckInSafetyStatus {
    if (status === 'escalated') return CheckInSafetyStatus.escalated;
    if (status === 'needs_review') return CheckInSafetyStatus.needs_review;
    return CheckInSafetyStatus.normal;
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

  private buildCheckInCursorFilter(cursor?: string): Prisma.WellbeingCheckInWhereInput | undefined {
    if (!cursor) return undefined;
    const decoded = decodeCursor(cursor);
    const sortDate = new Date(decoded.sortValue);
    if (Number.isNaN(sortDate.getTime())) return undefined;
    return {
      OR: [{ completedAt: { lt: sortDate } }, { completedAt: sortDate, id: { lt: decoded.id } }],
    };
  }

  private toHealthInputView(row: HealthInput): HealthInputView {
    return {
      id: row.id,
      user_account_id: row.userAccountId,
      category: row.category,
      field_code: row.fieldCode,
      value: row.numericValue !== null ? row.numericValue : row.textValue,
      numeric_value: row.numericValue,
      text_value: row.textValue,
      unit: row.unit,
      observed_at: row.observedAt.toISOString(),
      source_type: row.sourceType,
      source_reference: row.sourceReference,
      status: row.status,
      supersedes_input_id: row.supersedesInputId,
      consent_record_id: row.consentRecordId,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private toCheckInView(
    row: WellbeingCheckIn,
    crisisEscalation: CrisisEscalationCard | null,
    disclaimer = CHECK_IN_NON_DIAGNOSTIC_DISCLAIMER,
  ): WellbeingCheckInView {
    const rawResponses =
      row.responses && typeof row.responses === 'object' && !Array.isArray(row.responses)
        ? (row.responses as Record<string, number>)
        : {};
    return {
      id: row.id,
      user_account_id: row.userAccountId,
      questionnaire_version: row.questionnaireVersion,
      responses: rawResponses,
      completed_at: row.completedAt.toISOString(),
      source_type: row.sourceType,
      safety_status: row.safetyStatus,
      escalation_required: row.escalationRequired,
      escalation_category: row.escalationCategory,
      non_diagnostic_disclaimer: disclaimer,
      crisis_escalation: crisisEscalation,
      created_at: row.createdAt.toISOString(),
    };
  }
}
