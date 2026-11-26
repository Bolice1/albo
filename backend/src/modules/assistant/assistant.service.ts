import { Injectable } from '@nestjs/common';
import {
  ActorType,
  AssistantConversation,
  AssistantTurn,
  AuditOutcome,
  RiskAssessmentStatus,
} from '@prisma/client';
import { AppConfigService } from '@config/app-config.service';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { FeatureDisabledException, ResourceNotFoundException } from '@common/errors/app.exception';
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
import {
  AiContributingFactor,
  AiRecommendedNextStep,
  AiServiceClient,
  AiSuggestedActionCode,
} from '@integrations/ai-service/ai-service.client';
import { AuditService } from '@modules/audit/audit.service';
import { ConsentService } from '@modules/consent/consent.service';
import {
  FacilitiesCareService,
  FacilityView,
} from '@modules/facilities-care/facilities-care.service';
import { AccessPolicyService } from '@modules/identity-access/access-policy.service';
import { CreateAssistantConversationDto, SendAssistantMessageDto } from './dto/assistant.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CONVERSATION_WINDOW_TURNS = 5;

export interface AssistantTurnView {
  id: string;
  role: 'user' | 'assistant';
  response_type: string | null;
  referenced_assessment_id: string | null;
  adapter_version: string | null;
  escalation_triggered: boolean;
  bounded_summary_text: string | null;
  created_at: string;
}

export interface AssistantConversationView {
  id: string;
  user_account_id: string;
  status: string;
  topic_category: string | null;
  turn_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  turns?: AssistantTurnView[];
}

export interface AssistantMessageResponseView {
  conversation_id: string;
  turn_id: string;
  adapter_version: string;
  response_type: string;
  message_text: string;
  disclaimer: string;
  referenced_assessment_id: string | null;
  rule_model_version: string | null;
  suggested_actions: AiSuggestedActionCode[];
  verified_facilities: FacilityView[];
  crisis_escalation: CrisisEscalationCard | null;
  safety_metadata: {
    pre_filter_triggered: boolean;
    post_filter_triggered: boolean;
    escalation_required: boolean;
    escalation_category: string | null;
    reason_codes: string[];
  };
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly consentService: ConsentService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly auditService: AuditService,
    private readonly aiServiceClient: AiServiceClient,
    private readonly facilitiesCareService: FacilitiesCareService,
  ) {}

  async createConversation(
    principal: AuthenticatedPrincipal,
    dto: CreateAssistantConversationDto,
  ): Promise<AssistantConversationView> {
    this.assertAssistantEnabled();
    this.accessPolicy.assertCitizenSelf(principal);

    const consentRecord = await this.consentService.requireActiveConsent(
      principal.userAccountId,
      'assistant_conversations',
      'v1',
    );

    const conversation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assistantConversation.create({
        data: {
          userAccountId: principal.userAccountId,
          consentRecordId: consentRecord.id,
          status: 'active',
          topicCategory: dto.topic_category ?? null,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'assistant.conversation.create',
          resourceType: 'assistant_conversation',
          resourceId: created.id,
          outcome: AuditOutcome.succeeded,
          purposeCode: 'assistant_conversations',
          metadata: {
            topic_category: created.topicCategory,
          },
        },
        tx,
      );

      return created;
    });

    return this.toConversationView(conversation);
  }

  async listConversations(
    principal: AuthenticatedPrincipal,
    pagination: CursorPaginationQueryDto,
  ): Promise<PaginatedResult<AssistantConversationView>> {
    this.assertAssistantEnabled();
    this.accessPolicy.assertCitizenSelf(principal);

    const limit = Math.min(Math.max(1, pagination.limit ?? DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
    const decoded = pagination.cursor ? decodeCursor(pagination.cursor) : null;
    const sortDate = decoded ? new Date(decoded.sortValue) : null;

    const rows = await this.prisma.assistantConversation.findMany({
      where: {
        userAccountId: principal.userAccountId,
        ...(decoded && sortDate && !Number.isNaN(sortDate.getTime())
          ? {
              AND: [
                {
                  OR: [
                    { createdAt: { lt: sortDate } },
                    { createdAt: sortDate, id: { lt: decoded.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((row) => this.toConversationView(row));
    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.created_at,
    }));
  }

  async getConversationById(
    principal: AuthenticatedPrincipal,
    conversationId: string,
  ): Promise<AssistantConversationView> {
    this.assertAssistantEnabled();
    this.accessPolicy.assertCitizenSelf(principal);

    if (!UUID_REGEX.test(conversationId)) {
      throw new ResourceNotFoundException();
    }

    const conversation = await this.prisma.assistantConversation.findUnique({
      where: { id: conversationId },
      include: {
        turns: {
          orderBy: [{ createdAt: 'asc' }],
          take: 50,
        },
      },
    });

    if (!conversation) {
      throw new ResourceNotFoundException();
    }

    await this.accessPolicy.assertOwnerOrThrowNotFound(
      conversation.userAccountId,
      principal.userAccountId,
      {
        resourceType: 'assistant_conversation',
        resourceId: conversationId,
        action: 'assistant.conversation.read',
      },
    );

    return this.toConversationView(conversation, conversation.turns);
  }

  async sendMessage(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    dto: SendAssistantMessageDto,
  ): Promise<AssistantMessageResponseView> {
    this.assertAssistantEnabled();
    this.accessPolicy.assertCitizenSelf(principal);

    if (!UUID_REGEX.test(conversationId)) {
      throw new ResourceNotFoundException();
    }

    const conversation = await this.prisma.assistantConversation.findUnique({
      where: { id: conversationId },
      include: {
        turns: {
          orderBy: [{ createdAt: 'desc' }],
          take: MAX_CONVERSATION_WINDOW_TURNS,
        },
      },
    });

    if (!conversation) {
      throw new ResourceNotFoundException();
    }

    await this.accessPolicy.assertOwnerOrThrowNotFound(
      conversation.userAccountId,
      principal.userAccountId,
      {
        resourceType: 'assistant_conversation',
        resourceId: conversationId,
        action: 'assistant.message.send',
      },
    );

    // Re-verify consent at turn time (T-044)
    await this.consentService.requireActiveConsent(
      principal.userAccountId,
      'assistant_conversations',
      'v1',
    );

    // Caller-scoped, PII-free context assembly (AI-002, T-040)
    let latestAssessmentContext: {
      assessment_id: string;
      use_case_code: string;
      rule_model_version: string;
      status: 'complete' | 'limited' | 'failed';
      level: 'low' | 'moderate' | 'high' | null;
      calculated_at: string;
      contributing_factors: AiContributingFactor[];
      limitations: string[];
      recommended_next_steps: AiRecommendedNextStep[];
    } | null = null;

    const riskConsent = await this.consentService.verifyActiveConsent(
      principal.userAccountId,
      'preventive_risk_calculation',
      'v1',
    );

    if (riskConsent) {
      const latestAssessment = await this.prisma.riskAssessment.findFirst({
        where: {
          userAccountId: principal.userAccountId,
          supersededById: null,
          status: {
            in: [
              RiskAssessmentStatus.complete,
              RiskAssessmentStatus.limited,
              RiskAssessmentStatus.failed,
            ],
          },
        },
        include: {
          riskUseCase: true,
          ruleModelVersion: true,
        },
        orderBy: [{ createdAt: 'desc' }],
      });

      if (latestAssessment && latestAssessment.calculatedAt) {
        const mappedStatus =
          latestAssessment.status === RiskAssessmentStatus.complete
            ? 'complete'
            : latestAssessment.status === RiskAssessmentStatus.limited
              ? 'limited'
              : 'failed';
        latestAssessmentContext = {
          assessment_id: latestAssessment.id,
          use_case_code: latestAssessment.riskUseCase.code,
          rule_model_version: latestAssessment.ruleModelVersion.version,
          status: mappedStatus,
          level: latestAssessment.level,
          calculated_at: latestAssessment.calculatedAt.toISOString(),
          contributing_factors: Array.isArray(latestAssessment.contributingFactors)
            ? (latestAssessment.contributingFactors as unknown as AiContributingFactor[])
            : [],
          limitations: latestAssessment.limitations,
          recommended_next_steps: Array.isArray(latestAssessment.recommendedNextSteps)
            ? (latestAssessment.recommendedNextSteps as unknown as AiRecommendedNextStep[])
            : [],
        };
      }
    }

    const hasVerifiedFacilities = await this.facilitiesCareService.hasActiveVerifiedFacilities();

    const conversationWindow = [...conversation.turns]
      .reverse()
      .filter((t) => Boolean(t.boundedSummaryText))
      .map((t) => ({
        role: (t.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: t.boundedSummaryText ?? '',
      }));

    const sanitizedUserMessage = dto.message.replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
      '',
    );

    const aiResponse = await this.aiServiceClient.respondAssistant({
      conversation_id: conversation.id,
      authorization_context: {
        consent_verified: true,
        consent_purpose_code: 'assistant_conversations',
        consent_version: 'v1',
      },
      user_message: sanitizedUserMessage,
      conversation_window: conversationWindow,
      authorized_context_snapshot: {
        latest_assessment: latestAssessmentContext,
        has_verified_facilities: hasVerifiedFacilities,
        topic_hint: conversation.topicCategory,
      },
    });

    const shouldInjectFacilities =
      aiResponse.safety_metadata.escalation_required ||
      aiResponse.suggested_actions.includes('view_facilities');

    const verifiedFacilities = shouldInjectFacilities
      ? await this.facilitiesCareService.findVerifiedFacilitiesByTags(
          aiResponse.recommended_facility_tags,
          4,
        )
      : [];

    const crisisEscalation = aiResponse.safety_metadata.escalation_required
      ? buildDeterministicCrisisEscalationCard(
          aiResponse.safety_metadata.escalation_category,
          verifiedFacilities,
        )
      : null;

    const now = new Date();
    const assistantTurn = await this.prisma.$transaction(async (tx) => {
      // Minimize retained content: never retain raw crisis/trauma messages in `assistant_turns`
      await tx.assistantTurn.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          escalationTriggered: aiResponse.safety_metadata.escalation_required,
          safetyReasonCodes: aiResponse.safety_metadata.reason_codes ?? [],
          boundedSummaryText: aiResponse.safety_metadata.escalation_required
            ? '[REDACTED_SAFETY_ESCALATION_TURN]'
            : `[user_turn:${aiResponse.response_type}]`,
        },
      });

      const createdAssistantTurn = await tx.assistantTurn.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          responseType: aiResponse.response_type,
          referencedAssessmentId: aiResponse.referenced_assessment_id ?? null,
          adapterVersion: aiResponse.adapter_version,
          escalationTriggered: aiResponse.safety_metadata.escalation_required,
          safetyReasonCodes: aiResponse.safety_metadata.reason_codes ?? [],
          boundedSummaryText: aiResponse.message_text.slice(0, 280),
        },
      });

      await tx.assistantConversation.update({
        where: { id: conversation.id },
        data: {
          turnCount: { increment: 2 },
          lastMessageAt: now,
        },
      });

      await this.auditService.record(
        {
          actorId: principal.userAccountId,
          actorType: ActorType.user,
          action: 'assistant.message.respond',
          resourceType: 'assistant_conversation',
          resourceId: conversation.id,
          outcome: aiResponse.safety_metadata.escalation_required
            ? AuditOutcome.escalated
            : AuditOutcome.succeeded,
          purposeCode: 'assistant_conversations',
          metadata: {
            response_type: aiResponse.response_type,
            adapter_version: aiResponse.adapter_version,
            escalation_required: aiResponse.safety_metadata.escalation_required,
            pre_filter_triggered: aiResponse.safety_metadata.pre_filter_triggered,
            post_filter_triggered: aiResponse.safety_metadata.post_filter_triggered,
          },
        },
        tx,
      );

      return createdAssistantTurn;
    });

    return {
      conversation_id: conversation.id,
      turn_id: assistantTurn.id,
      adapter_version: aiResponse.adapter_version,
      response_type: aiResponse.response_type,
      message_text: aiResponse.message_text,
      disclaimer: aiResponse.disclaimer,
      referenced_assessment_id: aiResponse.referenced_assessment_id ?? null,
      rule_model_version: aiResponse.rule_model_version ?? null,
      suggested_actions: aiResponse.suggested_actions,
      verified_facilities: verifiedFacilities,
      crisis_escalation: crisisEscalation,
      safety_metadata: {
        pre_filter_triggered: aiResponse.safety_metadata.pre_filter_triggered,
        post_filter_triggered: aiResponse.safety_metadata.post_filter_triggered,
        escalation_required: aiResponse.safety_metadata.escalation_required,
        escalation_category: aiResponse.safety_metadata.escalation_category ?? null,
        reason_codes: aiResponse.safety_metadata.reason_codes ?? [],
      },
    };
  }

  private assertAssistantEnabled(): void {
    if (!this.config.featureAssistantEnabled) {
      throw new FeatureDisabledException(
        'The preventive AI assistant is currently disabled by platform governance.',
      );
    }
  }

  private toConversationView(
    row: AssistantConversation,
    turns?: AssistantTurn[],
  ): AssistantConversationView {
    return {
      id: row.id,
      user_account_id: row.userAccountId,
      status: row.status,
      topic_category: row.topicCategory,
      turn_count: row.turnCount,
      last_message_at: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      ...(turns
        ? {
            turns: turns.map((t) => ({
              id: t.id,
              role: (t.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
              response_type: t.responseType,
              referenced_assessment_id: t.referencedAssessmentId,
              adapter_version: t.adapterVersion,
              escalation_triggered: t.escalationTriggered,
              bounded_summary_text: t.boundedSummaryText,
              created_at: t.createdAt.toISOString(),
            })),
          }
        : {}),
    };
  }
}
