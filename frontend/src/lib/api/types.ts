/**
 * Client-side view types for the Albo public API (`/api/v1`).
 *
 * PROVISIONAL: These follow docs/02-architecture-and-engineering/API_DOCUMENTATION.md
 * (snake_case, `{ data, meta }` envelope). They must be reconciled against the
 * real backend responses during integration — the backend is still evolving and
 * is intentionally not modified by the frontend track.
 */

export type RiskLevel = "low" | "moderate" | "high";
export type RiskStatus = "complete" | "limited" | "failed";
export type InputSource = "self_reported" | "imported" | "generated";
export type InputStatus = "active" | "superseded";

export interface Me {
  id: string;
  display_name: string;
  handle: string;
  roles: string[];
}

export interface FeatureFlags {
  checkins: boolean;
  assistant: boolean;
  provider_portal: boolean;
}

export interface HealthInput {
  id: string;
  field_code: string;
  category: string;
  value: number | string;
  unit: string | null;
  source: InputSource;
  status: InputStatus;
  observed_at: string;
  created_at: string;
  supersedes_input_id: string | null;
}

export interface ContributingFactor {
  code: string;
  label: string;
  direction: "raises" | "lowers" | "neutral";
}

export interface RiskAssessment {
  id: string;
  use_case: string;
  status: RiskStatus;
  /** Always `null` when status is `limited` or `failed` (ADR-003, ADR-014). */
  level: RiskLevel | null;
  calculated_at: string;
  rule_model_version: string;
  contributing_factors: ContributingFactor[];
  limitations: string[];
  recommended_next_steps: string[];
  missing_inputs?: string[];
}

export interface Facility {
  id: string;
  name: string;
  type: string;
  services: string[];
  address: string;
  contact: string | null;
  location: { lat: number; lng: number };
  source: string;
  last_verified_at: string;
}

export type ReferralStatus = "requested" | "acknowledged" | "completed" | "cancelled";

export interface Referral {
  id: string;
  facility_id: string;
  facility_name: string;
  reason_category: string;
  status: ReferralStatus;
  requested_at: string;
  preferred_date: string | null;
}

export interface NotificationItem {
  id: string;
  category: "safety" | "reminder" | "report" | "system";
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface TrendPoint {
  date: string;
  value: number | null;
}

export interface TrendSeries {
  field_code: string;
  unit: string | null;
  points: TrendPoint[];
}

export interface EnvironmentObservation {
  id: string;
  metric: string;
  label: string;
  value: number;
  unit: string;
  area_label: string;
  source: string;
  observed_at: string;
}

export type ReportStatus = "queued" | "generating" | "ready" | "failed" | "expired";

export interface Report {
  id: string;
  status: ReportStatus;
  period_start: string;
  period_end: string;
  requested_at: string;
  completed_at: string | null;
}

export interface ConsentPurpose {
  code: string;
  version: string;
  title: string;
  description: string;
  data_involved: string;
  required: boolean;
}

export interface ConsentRecord {
  id: string;
  purpose_code: string;
  version: string;
  status: "granted" | "withdrawn";
  granted_at: string;
  withdrawn_at: string | null;
}

export interface ActivityEvent {
  id: string;
  kind: "health_input" | "risk_assessment" | "check_in" | "notification" | "referral";
  label: string;
  detail: string;
  at: string;
  outcome?: "done" | "pending" | "limited";
}

export interface ApiError {
  code: string;
  message: string;
  request_id?: string;
}

/** Mirrors backend `ALLOWED_NOTIFICATION_CATEGORIES` (notifications-reports DTO). */
export type NotificationCategoryCode =
  | "preventive_checkin_reminder"
  | "risk_indicator_update"
  | "report_ready"
  | "referral_status_update"
  | "consultation_status_update";

/** `GET/PATCH /api/v1/me/notification-preferences` (FR-015). Quiet hours are "HH:MM". */
export interface NotificationPreferences {
  in_app_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  enabled_categories: NotificationCategoryCode[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  updated_at: string;
}

/** `PATCH /api/v1/me/profile` permitted fields (FR-005). */
export interface ProfileUpdate {
  display_name?: string;
  preferred_language?: string;
}
