import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '@config/app-config.service';
import { RequestContextService } from '@common/context/request-context.service';
import {
  DependencyUnavailableException,
  ErrorDetail,
  FeatureDisabledException,
  ValidationDomainException,
} from '@common/errors/app.exception';

export const INTERNAL_SERVICE_TOKEN_HEADER = 'X-Internal-Service-Token';

export type AiRiskLevel = 'low' | 'moderate' | 'high';
export type AiAssessmentStatus = 'complete' | 'limited' | 'failed';
export type AiImplementationType = 'rule' | 'weighted_score';
export type AiEscalationCategory = 'mental_health_crisis' | 'acute_medical_emergency';
export type AiFactorDirection = 'increases_risk' | 'protective';
export type AiNextStepPriority = 'routine' | 'standard' | 'timely' | 'urgent_escalation';
export type AiCheckInSafetyStatus = 'normal' | 'needs_review' | 'escalated';
export type AiAssistantResponseType =
  | 'explanation'
  | 'preventive_guidance'
  | 'check_in_prompt'
  | 'refusal'
  | 'escalation'
  | 'unavailable';
export type AiSuggestedActionCode =
  | 'view_facilities'
  | 'view_risk_detail'
  | 'complete_check_in'
  | 'contact_emergency_support'
  | 'manage_consents';

export interface AiHealthResponse {
  status: 'ok';
  service: 'albo-ai-services';
  loaded_rule_versions: string[];
  assistant_enabled: boolean;
  request_id: string;
}

export interface AiHealthInputItem {
  field_code: string;
  value: number | string;
  unit?: string | null;
  observed_at: string;
  source_type?: 'self_reported' | 'imported' | 'provider_recorded' | 'generated';
}

export interface AiEnvironmentalObservationItem {
  observation_type: string;
  value: number;
  unit: string;
  observed_at: string;
  quality_status: 'verified' | 'unverified' | 'failed' | 'stale';
}

export interface AiCheckInResponseItem {
  question_code: string;
  value: number | string;
  observed_at?: string | null;
  source_type?: 'self_reported' | 'imported' | 'provider_recorded' | 'generated';
}

export interface AiRiskCalculationRequest {
  request_id?: string;
  use_case_code: string;
  rule_model_version: string;
  input_snapshot_id: string;
  calculated_for_timestamp: string;
  authorization_context: {
    consent_verified: true;
    consent_purpose_code: 'preventive_risk_calculation' | 'wellbeing_check_ins';
    consent_version: string;
  };
  inputs: {
    health_inputs: AiHealthInputItem[];
    environmental_observations: AiEnvironmentalObservationItem[];
    check_in_responses?: AiCheckInResponseItem[] | null;
    check_in_overlay?: AiCheckInResponseItem[] | null;
  };
}

export interface AiContributingFactor {
  factor_code: string;
  source_field: string;
  observed_at: string;
  source_type: string;
  direction: AiFactorDirection;
  explanation_key: string;
}

export interface AiRecommendedNextStep {
  action_code: string;
  priority: AiNextStepPriority;
  facility_service_tags?: string[] | null;
}

export interface AiRiskCalculationResponse {
  request_id: string;
  input_snapshot_id: string;
  use_case_code: string;
  rule_model_version: string;
  implementation_type: AiImplementationType;
  status: AiAssessmentStatus;
  calculated_at: string;
  result: {
    level: AiRiskLevel | null;
    score_band_or_weight_summary: string | null;
    contributing_factors: AiContributingFactor[];
    limitations: string[];
    recommended_next_steps: AiRecommendedNextStep[];
  };
  safety_metadata: {
    non_diagnostic_verified: boolean;
    escalation_required: boolean;
    escalation_category?: AiEscalationCategory | null;
    reason_codes: string[];
    missing_or_stale_fields: string[];
  };
}

export interface AiCheckInSafetyRequest {
  request_id?: string;
  questionnaire_version: string;
  completed_at: string;
  authorization_context: {
    consent_verified: true;
    consent_purpose_code: 'wellbeing_check_ins' | 'preventive_risk_calculation';
    consent_version: string;
  };
  responses:
    Array<{ question_code: string; response: number | string }> | Record<string, number | string>;
  free_text_reflection?: string | null;
}

export interface AiCheckInSafetyResponse {
  request_id: string;
  questionnaire_version: string;
  safety_status: AiCheckInSafetyStatus;
  escalation_required: boolean;
  escalation_category: AiEscalationCategory | null;
  escalation_reason_codes: string[];
  escalation_guidance_key: string | null;
  recommended_facility_tags: string[];
  non_diagnostic_disclaimer: string;
}

export interface AiAssistantRespondRequest {
  request_id?: string;
  conversation_id: string;
  authorization_context: {
    consent_verified: true;
    consent_purpose_code: 'assistant_conversations';
    consent_version: string;
  };
  user_message: string;
  conversation_window?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  authorized_context_snapshot?: {
    latest_assessment?: {
      assessment_id: string;
      use_case_code: string;
      rule_model_version: string;
      status: AiAssessmentStatus;
      level?: AiRiskLevel | null;
      calculated_at: string;
      contributing_factors?: AiContributingFactor[];
      limitations?: string[];
      recommended_next_steps?: AiRecommendedNextStep[];
    } | null;
    has_verified_facilities?: boolean;
    topic_hint?: string | null;
  };
}

export interface AiAssistantRespondResponse {
  request_id: string;
  conversation_id: string;
  adapter_version: string;
  response_type: AiAssistantResponseType;
  message_text: string;
  disclaimer: string;
  referenced_assessment_id?: string | null;
  rule_model_version?: string | null;
  suggested_actions: AiSuggestedActionCode[];
  recommended_facility_tags: string[];
  safety_metadata: {
    pre_filter_triggered: boolean;
    post_filter_triggered: boolean;
    escalation_required: boolean;
    escalation_category?: AiEscalationCategory | null;
    reason_codes: string[];
  };
}

interface InternalErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ field?: unknown; reason?: unknown }>;
  };
}

@Injectable()
export class AiServiceClient {
  private readonly baseUrl: string;

  constructor(
    private readonly config: AppConfigService,
    private readonly requestContext: RequestContextService,
  ) {
    this.baseUrl = this.config.aiServiceUrl.replace(/\/+$/, '');
  }

  async checkHealth(): Promise<AiHealthResponse> {
    return this.request<AiHealthResponse>('GET', '/internal/v1/health');
  }

  async calculateRiskAssessment(
    payload: AiRiskCalculationRequest,
  ): Promise<AiRiskCalculationResponse> {
    const requestId = payload.request_id ?? this.resolveRequestId();
    return this.request<AiRiskCalculationResponse>(
      'POST',
      '/internal/v1/risk-assessments/calculate',
      {
        ...payload,
        request_id: requestId,
      },
      requestId,
    );
  }

  async evaluateCheckInSafety(payload: AiCheckInSafetyRequest): Promise<AiCheckInSafetyResponse> {
    const requestId = payload.request_id ?? this.resolveRequestId();
    return this.request<AiCheckInSafetyResponse>(
      'POST',
      '/internal/v1/check-ins/evaluate-safety',
      {
        ...payload,
        request_id: requestId,
      },
      requestId,
    );
  }

  async respondAssistant(payload: AiAssistantRespondRequest): Promise<AiAssistantRespondResponse> {
    const requestId = payload.request_id ?? this.resolveRequestId();
    return this.request<AiAssistantRespondResponse>(
      'POST',
      '/internal/v1/assistant/respond',
      {
        ...payload,
        request_id: requestId,
      },
      requestId,
    );
  }

  private resolveRequestId(): string {
    return this.requestContext.getRequestId() ?? randomUUID();
  }

  private async request<TResponse>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    explicitRequestId?: string,
  ): Promise<TResponse> {
    const requestId = explicitRequestId ?? this.resolveRequestId();
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Request-Id': requestId,
      [INTERNAL_SERVICE_TOKEN_HEADER]: this.config.aiServiceToken,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.config.aiServiceTimeoutMs);
    if (typeof timeoutHandle.unref === 'function') {
      timeoutHandle.unref();
    }
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new DependencyUnavailableException(
        'The internal AI calculation service is temporarily unavailable.',
      );
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (response.ok) {
      try {
        return (await response.json()) as TResponse;
      } catch {
        throw new DependencyUnavailableException(
          'Received an unreadable response from the internal AI service.',
        );
      }
    }

    const parsedError = await this.safeParseErrorPayload(response);
    const sanitizedDetails = this.extractSanitizedDetails(parsedError?.error?.details);

    if (response.status === 422) {
      throw new ValidationDomainException(
        parsedError?.error?.message ?? 'The AI service rejected invalid calculation inputs.',
        sanitizedDetails,
      );
    }

    if (response.status === 503 && parsedError?.error?.code === 'FEATURE_DISABLED') {
      throw new FeatureDisabledException(
        parsedError.error.message ??
          'This AI capability is currently disabled by platform governance.',
        sanitizedDetails,
      );
    }

    throw new DependencyUnavailableException(
      'The internal AI calculation service could not fulfill the request.',
    );
  }

  private async safeParseErrorPayload(response: Response): Promise<InternalErrorPayload | null> {
    try {
      const parsed = (await response.json()) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as InternalErrorPayload;
      }
      return null;
    } catch {
      return null;
    }
  }

  private extractSanitizedDetails(
    rawDetails?: Array<{ field?: unknown; reason?: unknown }>,
  ): ErrorDetail[] {
    if (!Array.isArray(rawDetails)) {
      return [];
    }
    return rawDetails
      .filter(
        (item) =>
          Boolean(item) && typeof item.field === 'string' && typeof item.reason === 'string',
      )
      .slice(0, 25)
      .map((item) => ({
        field: String(item.field),
        reason: String(item.reason),
      }));
  }
}
