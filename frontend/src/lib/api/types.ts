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

/**
 * Runtime feature gates (ADR-017). Gated modules default to off in production
 * and are testable on synthetic fixtures in development (`ADR-019`).
 */
export interface FeatureFlags {
  checkins: boolean;
  assistant: boolean;
  provider_portal: boolean;
  /** Citizen consultation requests (gated with the provider portal, OPEN-009). */
  consultations: boolean;
  /** "Later" phase previews: device connections, regional health map (FR-010, Phase 2). */
  later_previews: boolean;
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

/** `POST/GET /api/v1/me/data-exports` (FR-006, DP-007). */
export interface DataExport {
  id: string;
  status: "requested" | "ready" | "expired" | "failed";
  requested_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

/** `POST /api/v1/me/account-deletion-requests` (FR-006). Backend grace period: 30 days. */
export interface AccountDeletionRequest {
  id: string;
  status: "requested" | "grace_period" | "completed" | "cancelled";
  requested_at: string;
  grace_period_ends_at: string;
}

/* ------------------------------ Wellbeing check-ins ------------------------ */

/** `wellbeing-v1` questionnaire responses; each score is 0–4 (backend CheckInResponsesDto). */
export interface CheckInResponses {
  stress_frequency_score: number;
  exhaustion_score: number;
  sleep_quality_score: number;
  self_harm_signal?: 0 | 1;
}

export interface EmergencyContact {
  code: string;
  label: string;
  contact_reference: string;
  synthetic_verify_before_production: boolean;
}

/** Deterministic, human-authored escalation card (FR-024). */
export interface CrisisEscalationCard {
  category: "mental_health_crisis" | "acute_medical_emergency";
  headline: string;
  message: string;
  governance_notice: string;
  emergency_contacts: EmergencyContact[];
  verified_facilities: Facility[];
}

export interface WellbeingCheckIn {
  id: string;
  questionnaire_version: "wellbeing-v1";
  responses: CheckInResponses;
  completed_at: string;
  safety_status: "routine" | "elevated" | "escalated";
  escalation_required: boolean;
  non_diagnostic_disclaimer: string;
  crisis_escalation: CrisisEscalationCard | null;
}

export interface NewCheckIn {
  responses: CheckInResponses;
  free_text_reflection?: string | null;
}

/* ---------------------------------- Assistant ------------------------------ */

export type AssistantResponseType =
  | "explanation"
  | "preventive_guidance"
  | "check_in_prompt"
  | "refusal"
  | "escalation"
  | "unavailable";

export type AssistantActionCode =
  | "view_facilities"
  | "view_risk_detail"
  | "start_check_in"
  | "contact_emergency_support";

export interface AssistantTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  created_at: string;
  response_type?: AssistantResponseType;
  disclaimer?: string;
  referenced_assessment_id?: string | null;
  rule_model_version?: string | null;
  suggested_actions?: AssistantActionCode[];
  crisis_escalation?: CrisisEscalationCard | null;
}

export interface AssistantConversation {
  id: string;
  title: string;
  status: "active" | "closed";
  last_message_at: string | null;
  turns: AssistantTurn[];
}

/* ------------------------------- Consultations ----------------------------- */

export type ConsultationStatus = "requested" | "scheduled" | "completed" | "cancelled";

export interface Consultation {
  id: string;
  provider_name: string;
  organization_name: string;
  status: ConsultationStatus;
  purpose: string;
  requested_for_at: string | null;
  scheduled_at: string | null;
  workflow_notice: string;
  created_at: string;
}

/* ------------------------------- Provider portal --------------------------- */

export interface AssignedCitizen {
  assignment_id: string;
  citizen_user_id: string;
  display_name: string;
  administrative_area: string;
  organization_name: string;
  allowed_scopes: ("health_inputs" | "risk_assessments" | "follow_ups")[];
  starts_at: string;
  ends_at: string | null;
  latest_level: RiskLevel | null;
  latest_status: RiskStatus | null;
}

export interface ProviderFollowUp {
  id: string;
  action_type: "lifestyle_counselling" | "schedule_visit" | "recheck_inputs" | "refer_to_facility";
  note: string;
  referenced_assessment_id: string | null;
  recommended_follow_up_at: string | null;
  created_at: string;
  provider_name: string;
}

export interface ProviderCitizenOverview {
  citizen: AssignedCitizen;
  birth_year: number | null;
  health_inputs: (HealthInput & { provenance_note: string })[];
  risk_assessments: RiskAssessment[];
  follow_ups: ProviderFollowUp[];
}

export interface NewFollowUp {
  action_type: ProviderFollowUp["action_type"];
  note: string;
  referenced_assessment_id: string | null;
  recommended_follow_up_at: string | null;
}

/* ---------------------------- Later-phase previews ------------------------- */

export interface DeviceSource {
  code: "apple_health" | "google_fit" | "fitbit";
  name: string;
  data_types: string[];
  status: "not_available" | "planned";
}

export interface RegionalIndicator {
  area_code: string;
  area_name: string;
  /** Aggregated, de-identified share of elevated indicators (synthetic). */
  elevated_share: number | null;
  population_band: string;
  location: { lat: number; lng: number };
  suppressed: boolean;
}
