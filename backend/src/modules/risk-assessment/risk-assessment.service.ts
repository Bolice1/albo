import { Injectable } from '@nestjs/common';
import {
  ActorType,
  AuditOutcome,
  ClinicalReviewStatus,
  HealthInputStatus,
  ObservationQualityStatus,
  Prisma,
  RiskAssessment,
  RiskAssessmentStatus,
  RiskLevel,
  RiskUseCase,
  RuleModelVersion,
  UseCaseStatus,
} from '@prisma/client';
import { AppConfigService } from '@config/app-config.service';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import {
  DependencyUnavailableException,
  FeatureDisabledException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '@common/errors/app.exception';
import {
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  PaginatedResult,
  paginateItems,
} from '@common/http/pagination.util';
import { sha256Json } from '@common/utils/crypto.util';
import { PrismaService } from '@database/prisma.service';
import {
  AiCheckInResponseItem,
  AiEnvironmentalObservationItem,
  AiHealthInputItem,
  AiServiceClient,
} from '@integrations/ai-service/ai-service.client';
import { AuditService } from '@modules/audit/audit.service';
import { ConsentService } from '@modules/consent/consent.service';
import { AccessPolicyService } from '@modules/identity-access/access-policy.service';
import { ListRiskAssessmentsQueryDto, RequestRiskAssessmentDto } from './dto/risk-assessment.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_USE_CASE_CODE = 'lifestyle_ncd_preventive';
const DEFAULT_RULE_MODEL_VERSION = 'rules-v1.0.0';

export interface RiskAssessmentView {
  id: string;
  use_case: string;
  status: RiskAssessmentStatus;
  level: RiskLevel | null;
  calculated_at: string | null;
  rule_model_version: string;
  contributing_factors: unknown[];
  limitations: string[];
  recommended_next_steps: unknown[];
  safety_metadata: Record<string, unknown>;
  superseded_by_id: string | null;
  provenance: {
    input_snapshot_id: string;
  };
  created_at: string;
}

@Injectable()
export class RiskAssessmentService {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly consentService: ConsentService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly auditService: AuditService,
    private readonly aiServiceClient: AiServiceClient,
  ) {}

  async listRiskAssessments(
    principal: AuthenticatedPrincipal,
    query: ListRiskAssessmentsQueryDto,
  ): Promise<PaginatedResult<RiskAssessmentView>> {
    this.accessPolicy.assertCitizenSelf(principal);

    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const cursorFilter = this.buildAssessmentCursorFilter(query.cursor);

    const rows = await this.prisma.riskAssessment.findMany({
      where: {
        userAccountId: principal.userAccountId,
        ...(query.use_case ? { riskUseCase: { code: query.use_case } } : {}),
        ...(cursorFilter ? { AND: [cursorFilter] } : {}),
      },
      include: {
        riskUseCase: true,
        ruleModelVersion: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((row) =>
      this.toRiskAssessmentView(row, row.riskUseCase, row.ruleModelVersion),
    );
    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.created_at,
    }));
  }

  async getRiskAssessmentById(
    principal: AuthenticatedPrincipal,
    assessmentId: string,
  ): Promise<RiskAssessmentView> {
    this.accessPolicy.assertCitizenSelf(principal);

    if (!UUID_REGEX.test(assessmentId)) {
      throw new ResourceNotFoundException();
    }

    const row = await this.prisma.riskAssessment.findUnique({
      where: { id: assessmentId },
      include: {
        riskUseCase: true,
        ruleModelVersion: true,
      },
    });

    if (!row) {
      throw new ResourceNotFoundException();
    }

    await this.accessPolicy.assertOwnerOrThrowNotFound(row.userAccountId, principal.userAccountId, {
      resourceType: 'risk_assessment',
      resourceId: assessmentId,
      action: 'risk_assessment.read',
    });

    return this.toRiskAssessmentView(row, row.riskUseCase, row.ruleModelVersion);
  }

  async requestRiskAssessment(
    principal: AuthenticatedPrincipal,
    dto: RequestRiskAssessmentDto,
  ): Promise<RiskAssessmentView> {
    this.accessPolicy.assertCitizenSelf(principal);

    const useCaseCode = dto.use_case_code ?? DEFAULT_USE_CASE_CODE;
    const approvedVersions = this.config.getApprovedRuleVersions(useCaseCode);
    const ruleModelVersion =
      dto.rule_model_version ?? approvedVersions[0] ?? DEFAULT_RULE_MODEL_VERSION;

    if (!this.config.isRuleVersionApproved(useCaseCode, ruleModelVersion)) {
      throw new FeatureDisabledException(
        'The requested preventive risk use case or rule version is not enabled by platform governance.',
        [{ field: 'rule_model_version', reason: 'unapproved_or_disabled_rule_version' }],
      );
    }

    const useCase = await this.prisma.riskUseCase.findUnique({
      where: { code: useCaseCode },
    });

    if (!useCase || useCase.status === UseCaseStatus.retired) {
      throw new ValidationDomainException('Unknown or retired risk use case.', [
        { field: 'use_case_code', reason: 'unknown_or_retired_use_case' },
      ]);
    }

    const versionRecord = await this.prisma.ruleModelVersion.findUnique({
      where: {
        riskUseCaseId_version: {
          riskUseCaseId: useCase.id,
          version: ruleModelVersion,
        },
      },
    });

    if (
      !versionRecord ||
      versionRecord.approvalStatus === ClinicalReviewStatus.retired ||
      versionRecord.retiredAt !== null
    ) {
      throw new ValidationDomainException('Unknown or retired rule_model_version.', [
        { field: 'rule_model_version', reason: 'unknown_or_retired_version' },
      ]);
    }

    const riskConsent = await this.consentService.requireActiveConsent(
      principal.userAccountId,
      'preventive_risk_calculation',
      'v1',
    );

    if (useCaseCode === 'wellbeing_checkin_screener') {
      await this.consentService.requireActiveConsent(
        principal.userAccountId,
        'wellbeing_check_ins',
        'v1',
      );
    } else {
      await this.consentService.requireActiveConsent(
        principal.userAccountId,
        'health_input_storage',
        'v1',
      );
    }

    const calculatedFor = dto.calculated_for_timestamp
      ? new Date(dto.calculated_for_timestamp)
      : new Date();

    if (Number.isNaN(calculatedFor.getTime())) {
      throw new ValidationDomainException('Invalid calculated_for_timestamp.', [
        { field: 'calculated_for_timestamp', reason: 'invalid_timestamp' },
      ]);
    }

    const snapshotPayload = await this.assembleMinimizedInputPayload(
      principal.userAccountId,
      useCase,
    );
    const payloadSha256 = sha256Json(snapshotPayload);

    const snapshot = await this.prisma.inputSnapshot.create({
      data: {
        userAccountId: principal.userAccountId,
        riskUseCaseId: useCase.id,
        consentRecordId: riskConsent.id,
        calculatedForTimestamp: calculatedFor,
        inputPayload: snapshotPayload as unknown as Prisma.InputJsonValue,
        payloadSha256,
        dataQualityStatus:
          snapshotPayload.health_inputs.length > 0 ||
          (snapshotPayload.check_in_responses?.length ?? 0) > 0
            ? 'collected'
            : 'empty',
      },
    });

    return this.evaluateSnapshotAndPersist({
      actorId: principal.userAccountId,
      actorType: ActorType.user,
      userAccountId: principal.userAccountId,
      useCase,
      versionRecord,
      snapshotId: snapshot.id,
      calculatedFor,
      snapshotPayload,
    });
  }

  /**
   * Executes a queued risk assessment in a background job after re-verifying active consent
   * at execution time (ACCESS_CONTROL.md §8.1, T-044).
   */
  async executeQueuedRiskAssessment(assessmentId: string): Promise<RiskAssessmentView> {
    const existing = await this.prisma.riskAssessment.findUnique({
      where: { id: assessmentId },
      include: {
        riskUseCase: true,
        ruleModelVersion: true,
        inputSnapshot: true,
      },
    });

    if (!existing) {
      throw new ResourceNotFoundException();
    }

    if (
      existing.status !== RiskAssessmentStatus.queued &&
      existing.status !== RiskAssessmentStatus.processing
    ) {
      return this.toRiskAssessmentView(existing, existing.riskUseCase, existing.ruleModelVersion);
    }

    const activeRiskConsent = await this.consentService.verifyActiveConsent(
      existing.userAccountId,
      'preventive_risk_calculation',
      'v1',
    );
    const sourceConsentCode =
      existing.riskUseCase.code === 'wellbeing_checkin_screener'
        ? 'wellbeing_check_ins'
        : 'health_input_storage';
    const activeSourceConsent = await this.consentService.verifyActiveConsent(
      existing.userAccountId,
      sourceConsentCode,
      'v1',
    );

    if (!activeRiskConsent || !activeSourceConsent) {
      const updated = await this.prisma.$transaction(async (tx) => {
        const limitedRow = await tx.riskAssessment.update({
          where: { id: existing.id },
          data: {
            status: RiskAssessmentStatus.limited,
            level: null,
            calculatedAt: new Date(),
            limitations: [
              'Preventive risk calculation was skipped because required data-processing consent was withdrawn.',
            ],
            safetyMetadata: {
              non_diagnostic_verified: true,
              escalation_required: false,
              reason_codes: ['CONSENT_WITHDRAWN'],
              missing_or_stale_fields: [],
            },
          },
        });

        await this.auditService.record(
          {
            actorId: null,
            actorType: ActorType.service,
            action: 'risk_assessment.job_skipped',
            resourceType: 'risk_assessment',
            resourceId: existing.id,
            outcome: AuditOutcome.denied,
            purposeCode: 'preventive_risk_calculation',
            metadata: {
              use_case_code: existing.riskUseCase.code,
              rule_model_version: existing.ruleModelVersion.version,
              reason: 'consent_withdrawn_before_job_execution',
            },
          },
          tx,
        );

        return limitedRow;
      });

      return this.toRiskAssessmentView(updated, existing.riskUseCase, existing.ruleModelVersion);
    }

    const rawPayload = existing.inputSnapshot.inputPayload as unknown as {
      health_inputs?: AiHealthInputItem[];
      environmental_observations?: AiEnvironmentalObservationItem[];
      check_in_responses?: AiCheckInResponseItem[];
    };

    const aiResponse = await this.aiServiceClient.calculateRiskAssessment({
      use_case_code: existing.riskUseCase.code,
      rule_model_version: existing.ruleModelVersion.version,
      input_snapshot_id: existing.inputSnapshotId,
      calculated_for_timestamp: existing.inputSnapshot.calculatedForTimestamp.toISOString(),
      authorization_context: {
        consent_verified: true,
        consent_purpose_code: 'preventive_risk_calculation',
        consent_version: 'v1',
      },
      inputs: {
        health_inputs: rawPayload?.health_inputs ?? [],
        environmental_observations: rawPayload?.environmental_observations ?? [],
        check_in_responses: rawPayload?.check_in_responses ?? null,
      },
    });

    const normalized = this.validateAndNormalizeAiResult(aiResponse);

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.riskAssessment.update({
        where: { id: existing.id },
        data: {
          status: normalized.status,
          level: normalized.level,
          calculatedAt: normalized.calculatedAt,
          contributingFactors: normalized.contributingFactors as Prisma.InputJsonValue,
          limitations: normalized.limitations,
          recommendedNextSteps: normalized.recommendedNextSteps as Prisma.InputJsonValue,
          safetyMetadata: normalized.safetyMetadata as Prisma.InputJsonValue,
        },
      });

      if (normalized.status === RiskAssessmentStatus.complete) {
        await this.supersedePriorAssessments(
          tx,
          existing.userAccountId,
          existing.riskUseCaseId,
          saved.id,
        );
      }

      await this.auditService.record(
        {
          actorId: null,
          actorType: ActorType.service,
          action: 'risk_assessment.calculate',
          resourceType: 'risk_assessment',
          resourceId: saved.id,
          outcome:
            normalized.status === RiskAssessmentStatus.complete
              ? AuditOutcome.succeeded
              : AuditOutcome.limited,
          purposeCode: 'preventive_risk_calculation',
          metadata: {
            use_case_code: existing.riskUseCase.code,
            rule_model_version: existing.ruleModelVersion.version,
            assessment_status: normalized.status,
            input_snapshot_id: existing.inputSnapshotId,
          },
        },
        tx,
      );

      return saved;
    });

    return this.toRiskAssessmentView(updated, existing.riskUseCase, existing.ruleModelVersion);
  }

  private async assembleMinimizedInputPayload(
    userAccountId: string,
    useCase: RiskUseCase,
  ): Promise<{
    health_inputs: AiHealthInputItem[];
    environmental_observations: AiEnvironmentalObservationItem[];
    check_in_responses?: AiCheckInResponseItem[];
  }> {
    const activeHealthInputs = await this.prisma.healthInput.findMany({
      where: {
        userAccountId,
        status: HealthInputStatus.active,
      },
      orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const latestByField = new Map<string, (typeof activeHealthInputs)[number]>();
    for (const row of activeHealthInputs) {
      if (!latestByField.has(row.fieldCode)) {
        latestByField.set(row.fieldCode, row);
      }
    }

    const healthInputsPayload: AiHealthInputItem[] = Array.from(latestByField.values()).map(
      (row) => ({
        field_code: row.fieldCode,
        value: row.numericValue !== null ? row.numericValue : (row.textValue ?? ''),
        unit: row.unit,
        observed_at: row.observedAt.toISOString(),
        source_type:
          row.sourceType === 'imported' ||
          row.sourceType === 'provider_recorded' ||
          row.sourceType === 'generated'
            ? row.sourceType
            : 'self_reported',
      }),
    );

    const environmentalPayload: AiEnvironmentalObservationItem[] = [];
    const usesEnvironmental = useCase.requiredInputCategories.some((cat) =>
      cat.includes('environmental'),
    );

    if (usesEnvironmental) {
      const envConsent = await this.consentService.verifyActiveConsent(
        userAccountId,
        'environmental_context',
        'v1',
      );
      if (envConsent) {
        const profile = await this.prisma.userProfile.findUnique({
          where: { userAccountId },
          select: { administrativeAreaCode: true },
        });
        if (profile?.administrativeAreaCode) {
          const observations = await this.prisma.environmentalObservation.findMany({
            where: {
              locationAreaId: profile.administrativeAreaCode,
              dataSource: {
                isCalculationApproved: true,
              },
            },
            orderBy: [{ observedAt: 'desc' }, { ingestedAt: 'desc' }],
            take: 20,
          });

          const latestObsByType = new Map<string, (typeof observations)[number]>();
          for (const obs of observations) {
            if (!latestObsByType.has(obs.observationType)) {
              latestObsByType.set(obs.observationType, obs);
            }
          }

          for (const obs of latestObsByType.values()) {
            environmentalPayload.push({
              observation_type: obs.observationType,
              value: obs.value,
              unit: obs.unit,
              observed_at: obs.observedAt.toISOString(),
              quality_status: this.mapObservationQualityStatus(obs.qualityStatus),
            });
          }
        }
      }
    }

    let checkInResponses: AiCheckInResponseItem[] | undefined;
    if (useCase.code === 'wellbeing_checkin_screener') {
      const latestCheckIn = await this.prisma.wellbeingCheckIn.findFirst({
        where: { userAccountId },
        orderBy: [{ completedAt: 'desc' }],
      });
      if (
        latestCheckIn &&
        latestCheckIn.responses &&
        typeof latestCheckIn.responses === 'object' &&
        !Array.isArray(latestCheckIn.responses)
      ) {
        checkInResponses = Object.entries(
          latestCheckIn.responses as Record<string, number | string>,
        ).map(([questionCode, val]) => ({
          question_code: questionCode,
          value: val,
          observed_at: latestCheckIn.completedAt.toISOString(),
          source_type: 'self_reported',
        }));
      }
    }

    return {
      health_inputs: healthInputsPayload,
      environmental_observations: environmentalPayload,
      ...(checkInResponses ? { check_in_responses: checkInResponses } : {}),
    };
  }

  private async evaluateSnapshotAndPersist(params: {
    actorId: string | null;
    actorType: ActorType;
    userAccountId: string;
    useCase: RiskUseCase;
    versionRecord: RuleModelVersion;
    snapshotId: string;
    calculatedFor: Date;
    snapshotPayload: {
      health_inputs: AiHealthInputItem[];
      environmental_observations: AiEnvironmentalObservationItem[];
      check_in_responses?: AiCheckInResponseItem[];
    };
  }): Promise<RiskAssessmentView> {
    try {
      const aiResponse = await this.aiServiceClient.calculateRiskAssessment({
        use_case_code: params.useCase.code,
        rule_model_version: params.versionRecord.version,
        input_snapshot_id: params.snapshotId,
        calculated_for_timestamp: params.calculatedFor.toISOString(),
        authorization_context: {
          consent_verified: true,
          consent_purpose_code: 'preventive_risk_calculation',
          consent_version: 'v1',
        },
        inputs: {
          health_inputs: params.snapshotPayload.health_inputs,
          environmental_observations: params.snapshotPayload.environmental_observations,
          check_in_responses: params.snapshotPayload.check_in_responses ?? null,
        },
      });

      const normalized = this.validateAndNormalizeAiResult(aiResponse);

      const created = await this.prisma.$transaction(async (tx) => {
        const assessment = await tx.riskAssessment.create({
          data: {
            userAccountId: params.userAccountId,
            riskUseCaseId: params.useCase.id,
            ruleModelVersionId: params.versionRecord.id,
            inputSnapshotId: params.snapshotId,
            status: normalized.status,
            level: normalized.level,
            calculatedAt: normalized.calculatedAt,
            contributingFactors: normalized.contributingFactors as Prisma.InputJsonValue,
            limitations: normalized.limitations,
            recommendedNextSteps: normalized.recommendedNextSteps as Prisma.InputJsonValue,
            safetyMetadata: normalized.safetyMetadata as Prisma.InputJsonValue,
          },
        });

        if (normalized.status === RiskAssessmentStatus.complete) {
          await this.supersedePriorAssessments(
            tx,
            params.userAccountId,
            params.useCase.id,
            assessment.id,
          );
        }

        await this.auditService.record(
          {
            actorId: params.actorId,
            actorType: params.actorType,
            action: 'risk_assessment.calculate',
            resourceType: 'risk_assessment',
            resourceId: assessment.id,
            outcome:
              normalized.status === RiskAssessmentStatus.complete
                ? AuditOutcome.succeeded
                : normalized.status === RiskAssessmentStatus.limited
                  ? AuditOutcome.limited
                  : AuditOutcome.failed,
            purposeCode: 'preventive_risk_calculation',
            metadata: {
              use_case_code: params.useCase.code,
              rule_model_version: params.versionRecord.version,
              assessment_status: normalized.status,
              input_snapshot_id: params.snapshotId,
            },
          },
          tx,
        );

        return assessment;
      });

      return this.toRiskAssessmentView(created, params.useCase, params.versionRecord);
    } catch (err) {
      if (err instanceof DependencyUnavailableException) {
        // Safe degraded mode (ADR-013, SYSTEM_DESIGN.md §16, T-037): record `failed` with `level: null`, NEVER low risk!
        const failedAssessment = await this.prisma.$transaction(async (tx) => {
          const assessment = await tx.riskAssessment.create({
            data: {
              userAccountId: params.userAccountId,
              riskUseCaseId: params.useCase.id,
              ruleModelVersionId: params.versionRecord.id,
              inputSnapshotId: params.snapshotId,
              status: RiskAssessmentStatus.failed,
              level: null,
              calculatedAt: new Date(),
              contributingFactors: [],
              limitations: [
                'Preventive risk calculation is temporarily unavailable. Unavailable or incomplete calculations never indicate low risk; seek clinical care if you feel unwell.',
              ],
              recommendedNextSteps: [],
              safetyMetadata: {
                non_diagnostic_verified: true,
                escalation_required: false,
                reason_codes: ['AI_SERVICE_UNAVAILABLE'],
                missing_or_stale_fields: [],
              },
            },
          });

          await this.auditService.record(
            {
              actorId: params.actorId,
              actorType: params.actorType,
              action: 'risk_assessment.calculate',
              resourceType: 'risk_assessment',
              resourceId: assessment.id,
              outcome: AuditOutcome.failed,
              purposeCode: 'preventive_risk_calculation',
              metadata: {
                use_case_code: params.useCase.code,
                rule_model_version: params.versionRecord.version,
                assessment_status: RiskAssessmentStatus.failed,
                input_snapshot_id: params.snapshotId,
                reason: 'ai_service_unavailable',
              },
            },
            tx,
          );

          return assessment;
        });

        return this.toRiskAssessmentView(failedAssessment, params.useCase, params.versionRecord);
      }
      throw err;
    }
  }

  private validateAndNormalizeAiResult(
    aiResponse: Awaited<ReturnType<AiServiceClient['calculateRiskAssessment']>>,
  ): {
    status: RiskAssessmentStatus;
    level: RiskLevel | null;
    calculatedAt: Date;
    contributingFactors: unknown[];
    limitations: string[];
    recommendedNextSteps: unknown[];
    safetyMetadata: Record<string, unknown>;
  } {
    const calculatedAt = new Date(aiResponse.calculated_at);
    const safeCalculatedAt = Number.isNaN(calculatedAt.getTime()) ? new Date() : calculatedAt;

    if (aiResponse.status === 'complete') {
      const validLevels: readonly string[] = [RiskLevel.low, RiskLevel.moderate, RiskLevel.high];
      if (
        !aiResponse.result.level ||
        !validLevels.includes(aiResponse.result.level) ||
        !Array.isArray(aiResponse.result.limitations) ||
        aiResponse.result.limitations.length === 0 ||
        aiResponse.safety_metadata?.non_diagnostic_verified !== true
      ) {
        // Malformed AI response protection (T-016): degrade safely to `failed` rather than storing invalid result
        return {
          status: RiskAssessmentStatus.failed,
          level: null,
          calculatedAt: safeCalculatedAt,
          contributingFactors: [],
          limitations: [
            'Preventive risk output could not be verified against safety invariants and is marked unavailable.',
          ],
          recommendedNextSteps: [],
          safetyMetadata: {
            non_diagnostic_verified: true,
            escalation_required: false,
            reason_codes: ['INVALID_AI_RESPONSE_SCHEMA'],
            missing_or_stale_fields: [],
          },
        };
      }

      return {
        status: RiskAssessmentStatus.complete,
        level: aiResponse.result.level as RiskLevel,
        calculatedAt: safeCalculatedAt,
        contributingFactors: aiResponse.result.contributing_factors ?? [],
        limitations: aiResponse.result.limitations,
        recommendedNextSteps: aiResponse.result.recommended_next_steps ?? [],
        safetyMetadata: {
          ...aiResponse.safety_metadata,
          non_diagnostic_verified: true,
        },
      };
    }

    if (aiResponse.status === 'limited') {
      return {
        status: RiskAssessmentStatus.limited,
        level: null,
        calculatedAt: safeCalculatedAt,
        contributingFactors: aiResponse.result.contributing_factors ?? [],
        limitations:
          aiResponse.result.limitations?.length > 0
            ? aiResponse.result.limitations
            : [
                'No current preventive risk indicator is available because required inputs are missing or out of date.',
              ],
        recommendedNextSteps: aiResponse.result.recommended_next_steps ?? [],
        safetyMetadata: {
          ...aiResponse.safety_metadata,
          non_diagnostic_verified: true,
        },
      };
    }

    return {
      status: RiskAssessmentStatus.failed,
      level: null,
      calculatedAt: safeCalculatedAt,
      contributingFactors: [],
      limitations:
        aiResponse.result.limitations?.length > 0
          ? aiResponse.result.limitations
          : ['Preventive risk calculation failed safely.'],
      recommendedNextSteps: [],
      safetyMetadata: {
        ...aiResponse.safety_metadata,
        non_diagnostic_verified: true,
      },
    };
  }

  private async supersedePriorAssessments(
    tx: Prisma.TransactionClient,
    userAccountId: string,
    riskUseCaseId: string,
    newAssessmentId: string,
  ): Promise<void> {
    const priors = await tx.riskAssessment.findMany({
      where: {
        userAccountId,
        riskUseCaseId,
        id: { not: newAssessmentId },
        status: RiskAssessmentStatus.complete,
        supersededById: null,
      },
    });

    for (const prior of priors) {
      const existingMeta =
        prior.safetyMetadata &&
        typeof prior.safetyMetadata === 'object' &&
        !Array.isArray(prior.safetyMetadata)
          ? (prior.safetyMetadata as Record<string, unknown>)
          : {};

      // Satisfy `risk_assessments_status_level_chk` (`status <> 'complete' => level IS NULL`)
      // while preserving `prior_level` in `safetyMetadata` for longitudinal trend continuity (FR-036).
      await tx.riskAssessment.update({
        where: { id: prior.id },
        data: {
          status: RiskAssessmentStatus.superseded,
          level: null,
          supersededById: newAssessmentId,
          safetyMetadata: {
            ...existingMeta,
            prior_level: prior.level,
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  private mapObservationQualityStatus(
    status: ObservationQualityStatus,
  ): 'verified' | 'unverified' | 'failed' | 'stale' {
    if (
      status === ObservationQualityStatus.verified ||
      status === ObservationQualityStatus.observed
    ) {
      return 'verified';
    }
    if (status === ObservationQualityStatus.stale) {
      return 'stale';
    }
    if (status === ObservationQualityStatus.failed) {
      return 'failed';
    }
    return 'unverified';
  }

  private buildAssessmentCursorFilter(
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

  private toRiskAssessmentView(
    row: RiskAssessment,
    useCase: RiskUseCase,
    ruleVersion: RuleModelVersion,
  ): RiskAssessmentView {
    const contributingFactors = Array.isArray(row.contributingFactors)
      ? row.contributingFactors
      : [];
    const recommendedNextSteps = Array.isArray(row.recommendedNextSteps)
      ? row.recommendedNextSteps
      : [];
    const safetyMetadata =
      row.safetyMetadata &&
      typeof row.safetyMetadata === 'object' &&
      !Array.isArray(row.safetyMetadata)
        ? (row.safetyMetadata as Record<string, unknown>)
        : {};

    return {
      id: row.id,
      use_case: useCase.code,
      status: row.status,
      level: row.level,
      calculated_at: row.calculatedAt ? row.calculatedAt.toISOString() : null,
      rule_model_version: ruleVersion.version,
      contributing_factors: contributingFactors,
      limitations: row.limitations,
      recommended_next_steps: recommendedNextSteps,
      safety_metadata: safetyMetadata,
      superseded_by_id: row.supersededById,
      provenance: {
        input_snapshot_id: row.inputSnapshotId,
      },
      created_at: row.createdAt.toISOString(),
    };
  }
}
