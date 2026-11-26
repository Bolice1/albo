export const ALBO_QUEUE_NAMES = {
  ENVIRONMENT_INGESTION: 'environment-ingestion',
  RISK_ASSESSMENT: 'risk-assessment',
  REPORT_GENERATION: 'report-generation',
  NOTIFICATION_DELIVERY: 'notification-delivery',
} as const;

export type AlboQueueName = (typeof ALBO_QUEUE_NAMES)[keyof typeof ALBO_QUEUE_NAMES];

export interface EnvironmentIngestionJobPayload {
  readonly area_code: string;
  readonly idempotency_key: string;
}

export interface RiskAssessmentJobPayload {
  readonly assessment_id: string;
}

export interface ReportGenerationJobPayload {
  readonly report_id: string;
}

export interface NotificationDeliveryJobPayload {
  readonly notification_id: string;
}
