import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ValidationDomainException } from '@common/errors/app.exception';

export const NOTIFICATION_CHANNEL_ADAPTER = Symbol('NOTIFICATION_CHANNEL_ADAPTER');

export type ExternalNotificationChannel = 'email' | 'sms' | 'push';

/**
 * Strict dot-separated generic localization key pattern (T-042, INTEGRATIONS.md §10).
 * Prohibits free-text health details, risk levels, symptoms, or clinical findings in SMS/email/push.
 */
export const ZERO_PHI_TEMPLATE_KEY_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+){1,6}$/;
export const SAFE_IN_APP_PATH_PATTERN = /^\/[a-z0-9/_-]{0,120}$/i;

const PROHIBITED_PHI_KEY_FRAGMENTS: readonly RegExp[] = [
  /\b(?:diagnosed|diagnosis|suicide|self_harm|chest_pain|high_risk|moderate_risk|low_risk|blood_pressure|hiv|cholera|malaria)\b/i,
];

export interface ExternalNotificationDispatchInput {
  notificationId: string;
  channel: ExternalNotificationChannel;
  category: string;
  titleKey: string;
  bodyKey: string;
  contentTemplateVersion: string;
  inAppTargetPath?: string | null;
  idempotencyKey?: string | null;
}

export interface ExternalNotificationDispatchResult {
  delivered: boolean;
  providerMessageId: string | null;
  failureCode: string | null;
}

export interface NotificationChannelAdapter {
  sendExternalNotification(
    input: ExternalNotificationDispatchInput,
  ): Promise<ExternalNotificationDispatchResult>;
}

export function assertZeroPhiNotificationPayload(
  titleKey: string,
  bodyKey: string,
  inAppTargetPath?: string | null,
): void {
  if (
    !titleKey ||
    titleKey.length > 96 ||
    !ZERO_PHI_TEMPLATE_KEY_PATTERN.test(titleKey) ||
    PROHIBITED_PHI_KEY_FRAGMENTS.some((re) => re.test(titleKey))
  ) {
    throw new ValidationDomainException(
      'Notification title_key must be a generic non-PHI localization key.',
      [{ field: 'title_key', reason: 'non_generic_or_phi_key_rejected' }],
    );
  }

  if (
    !bodyKey ||
    bodyKey.length > 96 ||
    !ZERO_PHI_TEMPLATE_KEY_PATTERN.test(bodyKey) ||
    PROHIBITED_PHI_KEY_FRAGMENTS.some((re) => re.test(bodyKey))
  ) {
    throw new ValidationDomainException(
      'Notification body_key must be a generic non-PHI localization key.',
      [{ field: 'body_key', reason: 'non_generic_or_phi_key_rejected' }],
    );
  }

  if (inAppTargetPath !== undefined && inAppTargetPath !== null) {
    if (!SAFE_IN_APP_PATH_PATTERN.test(inAppTargetPath)) {
      throw new ValidationDomainException(
        'Notification in_app_target_path must be a bounded relative route without query parameters.',
        [{ field: 'in_app_target_path', reason: 'unsafe_target_path' }],
      );
    }
  }
}

@Injectable()
export class SandboxExternalNotificationAdapter implements NotificationChannelAdapter {
  private failingChannel: ExternalNotificationChannel | 'all' | null = null;
  private failureCode = 'SANDBOX_CHANNEL_UNAVAILABLE';
  private readonly sentRecords: ExternalNotificationDispatchInput[] = [];
  private readonly idempotencyResults = new Map<string, ExternalNotificationDispatchResult>();

  setSimulatedFailure(
    channel: ExternalNotificationChannel | 'all' | null,
    code = 'SANDBOX_CHANNEL_UNAVAILABLE',
  ): void {
    this.failingChannel = channel;
    this.failureCode = code;
  }

  clearRecordedDeliveries(): void {
    this.sentRecords.length = 0;
    this.idempotencyResults.clear();
  }

  getRecordedDeliveries(): ReadonlyArray<ExternalNotificationDispatchInput> {
    return [...this.sentRecords];
  }

  async sendExternalNotification(
    input: ExternalNotificationDispatchInput,
  ): Promise<ExternalNotificationDispatchResult> {
    assertZeroPhiNotificationPayload(input.titleKey, input.bodyKey, input.inAppTargetPath);

    if (input.idempotencyKey) {
      const existing = this.idempotencyResults.get(input.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    if (this.failingChannel === 'all' || this.failingChannel === input.channel) {
      return {
        delivered: false,
        providerMessageId: null,
        failureCode: this.failureCode,
      };
    }

    const result: ExternalNotificationDispatchResult = {
      delivered: true,
      providerMessageId: `sandbox-${input.channel}-${randomUUID()}`,
      failureCode: null,
    };

    this.sentRecords.push({ ...input });
    if (input.idempotencyKey) {
      this.idempotencyResults.set(input.idempotencyKey, result);
    }

    return result;
  }
}
