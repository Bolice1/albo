/**
 * Albo API client.
 *
 * Mode is chosen by NEXT_PUBLIC_API_MODE:
 *  - "mock" (default): in-memory synthetic data, so the UI can be built while the
 *    backend is still evolving.
 *  - "live": calls `${NEXT_PUBLIC_API_BASE_URL}/api/v1`. Auth token wiring and
 *    route reconciliation happen during integration.
 *
 * The client never makes trusted authorization, consent, or risk decisions.
 */
import { ASSISTANT_DISCLAIMER, CHECK_IN_DISCLAIMER, CONSULTATION_NOTICE, createMockDb, type MockDb } from "./mock-data";
import { buildCrisisCard, screenCheckIn, screenMessage } from "./mock-safety";
import type {
  ActivityEvent,
  ConsentPurpose,
  ConsentRecord,
  AssignedCitizen,
  AssistantConversation,
  AssistantTurn,
  Consultation,
  DeviceSource,
  NewCheckIn,
  NewFollowUp,
  ProviderCitizenOverview,
  ProviderFollowUp,
  RegionalIndicator,
  WellbeingCheckIn,
  DataExport,
  AccountDeletionRequest,
  EnvironmentObservation,
  Facility,
  FeatureFlags,
  HealthInput,
  Me,
  NotificationItem,
  NotificationPreferences,
  ProfileUpdate,
  Referral,
  Report,
  RiskAssessment,
  TrendSeries,
} from "./types";

export interface NewHealthInput {
  field_code: string;
  value: number | string;
  unit: string | null;
  observed_at: string;
}

export interface NewReferral {
  facility_id: string;
  reason_category: string;
  preferred_date: string | null;
}

export interface AlboApi {
  getMe(): Promise<Me>;
  getFeatures(): Promise<FeatureFlags>;
  listHealthInputs(opts?: { includeHistory?: boolean }): Promise<HealthInput[]>;
  createHealthInput(input: NewHealthInput): Promise<HealthInput>;
  correctHealthInput(id: string, input: NewHealthInput): Promise<HealthInput>;
  listRiskAssessments(): Promise<RiskAssessment[]>;
  getRiskAssessment(id: string): Promise<RiskAssessment>;
  requestRiskAssessment(): Promise<RiskAssessment>;
  listFacilities(query?: { q?: string; service?: string }): Promise<Facility[]>;
  listReferrals(): Promise<Referral[]>;
  createReferral(input: NewReferral): Promise<Referral>;
  listNotifications(): Promise<NotificationItem[]>;
  markNotificationRead(id: string): Promise<void>;
  getTrends(): Promise<TrendSeries[]>;
  getEnvironment(): Promise<EnvironmentObservation[]>;
  listReports(): Promise<Report[]>;
  requestReport(period: { start: string; end: string }): Promise<Report>;
  listConsentPurposes(): Promise<ConsentPurpose[]>;
  listConsents(): Promise<ConsentRecord[]>;
  grantConsent(code: string, version: string): Promise<ConsentRecord>;
  withdrawConsent(id: string): Promise<ConsentRecord>;
  listActivity(): Promise<ActivityEvent[]>;
  updateProfile(input: ProfileUpdate): Promise<Me>;
  getNotificationPreferences(): Promise<NotificationPreferences>;
  updateNotificationPreferences(input: Partial<Omit<NotificationPreferences, "updated_at">>): Promise<NotificationPreferences>;
  markAllNotificationsRead(): Promise<void>;
  listDataExports(): Promise<DataExport[]>;
  requestDataExport(): Promise<DataExport>;
  requestAccountDeletion(): Promise<AccountDeletionRequest>;
  /** Mock/dev only: flip a runtime feature gate for demos. */
  setFeature(flag: keyof FeatureFlags, enabled: boolean): Promise<FeatureFlags>;
  listCheckIns(): Promise<WellbeingCheckIn[]>;
  createCheckIn(input: NewCheckIn): Promise<WellbeingCheckIn>;
  listConversations(): Promise<AssistantConversation[]>;
  createConversation(): Promise<AssistantConversation>;
  sendAssistantMessage(conversationId: string, text: string): Promise<AssistantTurn>;
  listConsultations(): Promise<Consultation[]>;
  requestConsultation(input: { purpose: string; requested_for_at: string | null }): Promise<Consultation>;
  cancelConsultation(id: string): Promise<Consultation>;
  listAssignedCitizens(): Promise<AssignedCitizen[]>;
  getCitizenOverview(citizenId: string): Promise<ProviderCitizenOverview>;
  createFollowUp(citizenId: string, input: NewFollowUp): Promise<ProviderFollowUp>;
  listDeviceSources(): Promise<DeviceSource[]>;
  listRegionalIndicators(): Promise<RegionalIndicator[]>;
}

export const ASSISTANT_MAX_CHARS = 1000;

const HH_MM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

/* ---------------------------------- mock ---------------------------------- */

const latency = (ms = 250) => new Promise((r) => setTimeout(r, ms));
let seq = 100;
const nextId = (prefix: string) => `${prefix}_${++seq}`;
const clone = <T,>(v: T): T => structuredClone(v);

export function createMockApi(db: MockDb = createMockDb(), delayMs = 250): AlboApi {
  const wait = (ms = delayMs) => latency(ms);
  const notFound = () => new ApiRequestError("NOT_FOUND", "This item is not available.", 404);
  const hasConsent = (code: string) =>
    db.consents.some((c) => c.purpose_code === code && c.status === "granted");
  const gated = (name: string) => new ApiRequestError("FEATURE_DISABLED", `${name} is not available yet.`, 404);
  const forbidden = (purpose: string) =>
    new ApiRequestError("FORBIDDEN", `This action needs your consent for "${purpose}".`, 403);

  return {
    async getMe() { await wait(); return clone(db.me); },
    async getFeatures() { await wait(); return clone(db.features); },
    async listHealthInputs(opts) {
      await wait();
      const rows = opts?.includeHistory ? db.healthInputs : db.healthInputs.filter((i) => i.status === "active");
      return clone(rows);
    },
    async createHealthInput(input) {
      await wait();
      if (!hasConsent("health_input_storage")) throw forbidden("health_input_storage");
      const now = new Date().toISOString();
      db.healthInputs
        .filter((i) => i.field_code === input.field_code && i.status === "active")
        .forEach((i) => (i.status = "superseded"));
      const row: HealthInput = {
        id: nextId("hin"),
        category: input.field_code.split("_")[0],
        source: "self_reported",
        status: "active",
        created_at: now,
        supersedes_input_id: null,
        ...input,
      };
      db.healthInputs.unshift(row);
      return clone(row);
    },
    async correctHealthInput(id, input) {
      await wait();
      const target = db.healthInputs.find((i) => i.id === id && i.status === "active");
      if (!target) throw notFound();
      target.status = "superseded";
      const row: HealthInput = {
        ...target,
        ...input,
        id: nextId("hin"),
        status: "active",
        created_at: new Date().toISOString(),
        supersedes_input_id: id,
      };
      db.healthInputs.unshift(row);
      return clone(row);
    },
    async listRiskAssessments() { await wait(); return clone(db.riskAssessments); },
    async getRiskAssessment(id) {
      await wait();
      const r = db.riskAssessments.find((a) => a.id === id);
      if (!r) throw notFound();
      return clone(r);
    },
    async requestRiskAssessment() {
      await wait(600);
      if (!hasConsent("preventive_risk_calculation")) throw forbidden("preventive_risk_calculation");
      // Mock only echoes the latest stored result; real calculation happens server-side.
      const latest = clone(db.riskAssessments[0]);
      latest.id = nextId("ras");
      latest.calculated_at = new Date().toISOString();
      db.riskAssessments.unshift(latest);
      return clone(latest);
    },
    async listFacilities(query) {
      await wait();
      const q = query?.q?.toLowerCase().trim();
      return clone(
        db.facilities.filter(
          (f) =>
            (!q || f.name.toLowerCase().includes(q) || f.services.some((s) => s.toLowerCase().includes(q))) &&
            (!query?.service || f.services.includes(query.service)),
        ),
      );
    },
    async listReferrals() { await wait(); return clone(db.referrals); },
    async createReferral(input) {
      await wait();
      const facility = db.facilities.find((f) => f.id === input.facility_id);
      if (!facility) throw notFound();
      const row: Referral = {
        id: nextId("ref"),
        facility_name: facility.name,
        status: "requested",
        requested_at: new Date().toISOString(),
        ...input,
      };
      db.referrals.unshift(row);
      return clone(row);
    },
    async listNotifications() { await wait(); return clone(db.notifications); },
    async markNotificationRead(id) {
      await wait();
      const n = db.notifications.find((x) => x.id === id);
      if (n) n.read_at = new Date().toISOString();
    },
    async getTrends() { await wait(); return clone(db.trends); },
    async getEnvironment() {
      await wait();
      if (!hasConsent("environmental_context")) throw forbidden("environmental_context");
      return clone(db.environment);
    },
    async listReports() { await wait(); return clone(db.reports); },
    async requestReport(period) {
      await wait();
      if (!hasConsent("report_generation")) throw forbidden("report_generation");
      const row: Report = {
        id: nextId("rep"),
        status: "queued",
        period_start: period.start,
        period_end: period.end,
        requested_at: new Date().toISOString(),
        completed_at: null,
      };
      db.reports.unshift(row);
      return clone(row);
    },
    async listConsentPurposes() { await wait(); return clone(db.consentPurposes); },
    async listConsents() { await wait(); return clone(db.consents); },
    async grantConsent(code, version) {
      await wait();
      const existing = db.consents.find((c) => c.purpose_code === code);
      const now = new Date().toISOString();
      if (existing) {
        existing.status = "granted";
        existing.granted_at = now;
        existing.withdrawn_at = null;
        return clone(existing);
      }
      const row: ConsentRecord = { id: nextId("cns"), purpose_code: code, version, status: "granted", granted_at: now, withdrawn_at: null };
      db.consents.push(row);
      return clone(row);
    },
    async withdrawConsent(id) {
      await wait();
      const c = db.consents.find((x) => x.id === id);
      if (!c) throw notFound();
      c.status = "withdrawn";
      c.withdrawn_at = new Date().toISOString();
      return clone(c);
    },
    async listActivity() { await wait(); return clone(db.activity); },
    async updateProfile(input) {
      await wait();
      const name = input.display_name?.trim();
      if (input.display_name !== undefined && (!name || name.length > 80)) {
        throw new ApiRequestError("VALIDATION_ERROR", "Enter a display name of 1–80 characters.", 422);
      }
      if (name) {
        db.me.display_name = name;
        db.me.handle = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || db.me.handle;
      }
      return clone(db.me);
    },
    async getNotificationPreferences() { await wait(); return clone(db.notificationPreferences); },
    async updateNotificationPreferences(input) {
      await wait();
      const next = { ...db.notificationPreferences, ...input };
      // Delivery beyond the in-app inbox needs notifications_delivery consent (API §8.6).
      const external = next.email_enabled || next.sms_enabled || next.push_enabled;
      if (external && !hasConsent("notifications_delivery")) throw forbidden("notifications_delivery");
      for (const t of [next.quiet_hours_start, next.quiet_hours_end]) {
        if (t !== null && !HH_MM.test(t)) {
          throw new ApiRequestError("VALIDATION_ERROR", "Quiet hours must use the HH:MM format.", 422);
        }
      }
      if ((next.quiet_hours_start === null) !== (next.quiet_hours_end === null)) {
        throw new ApiRequestError("VALIDATION_ERROR", "Set both a start and an end for quiet hours, or neither.", 422);
      }
      db.notificationPreferences = { ...next, updated_at: new Date().toISOString() };
      return clone(db.notificationPreferences);
    },
    async markAllNotificationsRead() {
      await wait();
      const now = new Date().toISOString();
      db.notifications.forEach((n) => (n.read_at ??= now));
    },
    async listDataExports() { await wait(); return clone(db.dataExports); },
    async requestDataExport() {
      await wait();
      if (db.dataExports.some((e) => e.status === "requested")) {
        throw new ApiRequestError("CONFLICT", "An export is already being prepared.", 409);
      }
      const row: DataExport = {
        id: nextId("exp"),
        status: "requested",
        requested_at: new Date().toISOString(),
        completed_at: null,
        expires_at: null,
      };
      db.dataExports.unshift(row);
      // Simulate background preparation.
      setTimeout(() => {
        const now = Date.now();
        Object.assign(row, {
          status: "ready",
          completed_at: new Date(now).toISOString(),
          expires_at: new Date(now + 7 * 86_400_000).toISOString(),
        });
      }, Math.max(delayMs, 1) * 8);
      return clone(row);
    },
    async requestAccountDeletion() {
      await wait();
      if (db.deletionRequest) return clone(db.deletionRequest);
      const now = Date.now();
      db.deletionRequest = {
        id: nextId("del"),
        status: "grace_period",
        requested_at: new Date(now).toISOString(),
        grace_period_ends_at: new Date(now + 30 * 86_400_000).toISOString(),
      };
      return clone(db.deletionRequest);
    },
    async setFeature(flag, enabled) {
      await wait(0);
      db.features[flag] = enabled;
      return clone(db.features);
    },
    async listCheckIns() {
      await wait();
      if (!db.features.checkins) throw gated("Wellbeing check-ins");
      return clone(db.checkIns);
    },
    async createCheckIn(input) {
      await wait();
      if (!db.features.checkins) throw gated("Wellbeing check-ins");
      if (!hasConsent("wellbeing_check_ins")) throw forbidden("wellbeing_check_ins");
      const r = input.responses;
      const scores = [r.stress_frequency_score, r.exhaustion_score, r.sleep_quality_score];
      if (scores.some((v) => !Number.isInteger(v) || v < 0 || v > 4)) {
        throw new ApiRequestError("VALIDATION_ERROR", "Each answer must be between 0 and 4.", 422);
      }
      const screen = screenCheckIn(r);
      const row: WellbeingCheckIn = {
        id: nextId("chk"),
        questionnaire_version: "wellbeing-v1",
        responses: { ...r },
        completed_at: new Date().toISOString(),
        safety_status: screen.safety_status,
        escalation_required: screen.escalation !== null,
        non_diagnostic_disclaimer: CHECK_IN_DISCLAIMER,
        crisis_escalation: screen.escalation ? buildCrisisCard(screen.escalation, db.facilities) : null,
      };
      // Free-text reflection is intentionally not persisted by the mock (data minimisation).
      db.checkIns.unshift(row);
      return clone(row);
    },
    async listConversations() {
      await wait();
      if (!db.features.assistant) throw gated("The assistant");
      return clone(db.conversations);
    },
    async createConversation() {
      await wait();
      if (!db.features.assistant) throw gated("The assistant");
      if (!hasConsent("assistant_conversations")) throw forbidden("assistant_conversations");
      const row: AssistantConversation = { id: nextId("cnv"), title: "New conversation", status: "active", last_message_at: null, turns: [] };
      db.conversations.unshift(row);
      return clone(row);
    },
    async sendAssistantMessage(conversationId, text) {
      await wait(500);
      if (!db.features.assistant) throw gated("The assistant");
      if (!hasConsent("assistant_conversations")) throw forbidden("assistant_conversations");
      const conv = db.conversations.find((c) => c.id === conversationId);
      if (!conv) throw notFound();
      const clean = text.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
      if (!clean || clean.length > ASSISTANT_MAX_CHARS) {
        throw new ApiRequestError("VALIDATION_ERROR", `Messages must be 1–${ASSISTANT_MAX_CHARS} characters.`, 422);
      }
      const now = new Date().toISOString();
      conv.turns.push({ id: nextId("trn"), role: "user", text: clean, created_at: now });
      if (conv.title === "New conversation") conv.title = clean.length > 40 ? `${clean.slice(0, 40)}…` : clean;
      const reply = respond(clean);
      const turn: AssistantTurn = { id: nextId("trn"), role: "assistant", created_at: now, disclaimer: ASSISTANT_DISCLAIMER, ...reply };
      conv.turns.push(turn);
      conv.last_message_at = now;
      return clone(turn);
    },
    async listConsultations() {
      await wait();
      if (!db.features.consultations) throw gated("Consultations");
      return clone(db.consultations);
    },
    async requestConsultation(input) {
      await wait();
      if (!db.features.consultations) throw gated("Consultations");
      if (!input.purpose.trim()) throw new ApiRequestError("VALIDATION_ERROR", "Choose a reason for the consultation.", 422);
      const row: Consultation = {
        id: nextId("cns_req"),
        provider_name: "Assigned provider (pending)",
        organization_name: "Demo Hills Health Centre",
        status: "requested",
        purpose: input.purpose,
        requested_for_at: input.requested_for_at,
        scheduled_at: null,
        workflow_notice: CONSULTATION_NOTICE,
        created_at: new Date().toISOString(),
      };
      db.consultations.unshift(row);
      return clone(row);
    },
    async cancelConsultation(id) {
      await wait();
      const c = db.consultations.find((x) => x.id === id);
      if (!c) throw notFound();
      if (c.status === "completed") throw new ApiRequestError("CONFLICT", "A completed consultation can't be cancelled.", 409);
      c.status = "cancelled";
      return clone(c);
    },
    async listAssignedCitizens() {
      await wait();
      if (!db.features.provider_portal) throw gated("The provider portal");
      const now = Date.now();
      // Only active assignments are visible (FR-031).
      return clone(db.assignedCitizens.filter((a) => !a.ends_at || Date.parse(a.ends_at) > now));
    },
    async getCitizenOverview(citizenId) {
      await wait();
      if (!db.features.provider_portal) throw gated("The provider portal");
      const citizen = db.assignedCitizens.find((a) => a.citizen_user_id === citizenId);
      // Unassigned and unknown citizens look identical: never confirm another person's record.
      if (!citizen) throw new ApiRequestError("NOT_FOUND", "This record is not available to you.", 404);
      const scopes = new Set(citizen.allowed_scopes);
      const hrs = (iso: string) => Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
      return clone({
        citizen,
        birth_year: 1988,
        health_inputs: scopes.has("health_inputs")
          ? db.healthInputs
              .filter((i) => i.status === "active")
              .map((i) => ({ ...i, provenance_note: `Self-reported by the citizen · ${hrs(i.observed_at)} h old` }))
          : [],
        risk_assessments: scopes.has("risk_assessments") ? db.riskAssessments.slice(0, 2) : [],
        follow_ups: scopes.has("follow_ups") ? (db.followUps[citizenId] ?? []) : [],
      });
    },
    async createFollowUp(citizenId, input) {
      await wait();
      const citizen = db.assignedCitizens.find((a) => a.citizen_user_id === citizenId);
      if (!citizen) throw new ApiRequestError("NOT_FOUND", "This record is not available to you.", 404);
      if (!citizen.allowed_scopes.includes("follow_ups")) {
        throw new ApiRequestError("FORBIDDEN", "Your assignment doesn't allow recording follow-ups for this person.", 403);
      }
      const note = input.note.trim();
      if (!note || note.length > 500) throw new ApiRequestError("VALIDATION_ERROR", "Add a note of 1–500 characters.", 422);
      const row: ProviderFollowUp = {
        id: nextId("fup"),
        ...input,
        note,
        created_at: new Date().toISOString(),
        provider_name: db.me.display_name,
      };
      (db.followUps[citizenId] ??= []).unshift(row);
      return clone(row);
    },
    async listDeviceSources() { await wait(); return clone(db.devices); },
    async listRegionalIndicators() { await wait(); return clone(db.regional); },
  };

  /** Stage 1 template assistant (AI_ASSISTANT §9): deterministic screening, then templates. */
  function respond(text: string): Omit<AssistantTurn, "id" | "role" | "created_at" | "disclaimer"> {
    const screen = screenMessage(text);
    if (screen.kind === "escalation") {
      const card = buildCrisisCard(screen.category, db.facilities);
      return { text: card.message, response_type: "escalation", crisis_escalation: card, suggested_actions: ["contact_emergency_support", "view_facilities"] };
    }
    if (screen.kind === "refusal") {
      const why = {
        diagnosis: "I can't diagnose conditions or interpret test results. A qualified health worker can help with that.",
        prescription: "I can't recommend or adjust medicines or doses. Please speak with a doctor, nurse or pharmacist.",
        other_person: "I can only talk about your own information, never someone else's.",
        injection: "I can't change how I work. I'm here to explain your Albo information and share general preventive guidance.",
      }[screen.reason];
      return { text: why, response_type: "refusal", suggested_actions: ["view_facilities"] };
    }
    const latest = db.riskAssessments[0];
    if (/\b(indicator|risk|result|score|level)\b/i.test(text) && latest) {
      if (latest.status !== "complete" || !latest.level) {
        return {
          text: "Your latest indicator has limited information, so Albo can't show a level yet. Updating your health inputs can help.",
          response_type: "explanation",
          referenced_assessment_id: latest.id,
          rule_model_version: latest.rule_model_version,
          suggested_actions: ["view_risk_detail"],
        };
      }
      const factors = latest.contributing_factors.filter((f) => f.direction === "raises").map((f) => f.label.toLowerCase());
      return {
        text: `Albo identified a ${latest.level} preventive risk indicator based on the information available. ${
          factors.length ? `The main factors were ${factors.join(" and ")}. ` : ""
        }This is not a diagnosis. ${latest.recommended_next_steps[0] ?? ""}`.trim(),
        response_type: "explanation",
        referenced_assessment_id: latest.id,
        rule_model_version: latest.rule_model_version,
        suggested_actions: ["view_risk_detail", "view_facilities"],
      };
    }
    if (/\b(stress|stressed|tired|exhausted|overwhelmed|sleep|anxious|low mood)\b/i.test(text)) {
      return {
        text: "Feeling stretched is common, and noticing it is a good first step. Short walks, regular sleep times and talking with someone you trust can help. A quick wellbeing check-in can help you track how you feel over time. If it feels like too much, please reach out to a health worker.",
        response_type: "check_in_prompt",
        suggested_actions: ["start_check_in", "view_facilities"],
      };
    }
    if (/\b(facility|clinic|hospital|doctor|nurse|care|pharmacy)\b/i.test(text)) {
      return { text: "You can search nearby facilities, with their services and when the details were last checked, on the Find care page.", response_type: "preventive_guidance", suggested_actions: ["view_facilities"] };
    }
    return {
      text: "General preventive guidance: aim for regular physical activity, plenty of fruit and vegetables, enough sleep and no tobacco. I can also explain your Albo indicator. Just ask about it.",
      response_type: "preventive_guidance",
      suggested_actions: ["view_risk_detail"],
    };
  }
}

/* ---------------------------------- live ---------------------------------- */

function createLiveApi(baseUrl: string): AlboApi {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers },
      credentials: "include",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = body?.error;
      throw new ApiRequestError(err?.code ?? "INTERNAL_ERROR", err?.message ?? "Something went wrong.", res.status, err?.request_id);
    }
    return body?.data as T;
  }
  const notYet = (name: string) => () =>
    Promise.reject(new ApiRequestError("NOT_INTEGRATED", `${name} is not integrated yet.`, 501));

  // Routes below follow API_DOCUMENTATION.md; reconcile during integration (plan §6).
  return {
    getMe: () => request("/me"),
    getFeatures: notYet("Feature flags"),
    listHealthInputs: (o) => request(`/me/health-inputs${o?.includeHistory ? "?include_history=true" : ""}`),
    createHealthInput: (i) => request("/me/health-inputs", { method: "POST", body: JSON.stringify(i) }),
    correctHealthInput: (id, i) => request(`/me/health-inputs/${id}`, { method: "PATCH", body: JSON.stringify(i) }),
    listRiskAssessments: () => request("/me/risk-assessments"),
    getRiskAssessment: (id) => request(`/me/risk-assessments/${id}`),
    requestRiskAssessment: () =>
      request("/me/risk-assessments", { method: "POST", body: JSON.stringify({ use_case: "lifestyle_ncd_preventive" }) }),
    listFacilities: (q) => request(`/facilities?${new URLSearchParams(q as Record<string, string>)}`),
    listReferrals: () => request("/referrals"),
    createReferral: (i) => request("/referrals", { method: "POST", body: JSON.stringify(i) }),
    listNotifications: () => request("/me/notifications"),
    markNotificationRead: (id) => request(`/me/notifications/${id}/read`, { method: "POST" }),
    getTrends: () => request("/me/trends"),
    getEnvironment: () => request("/environment"),
    listReports: () => request("/me/reports"),
    requestReport: (p) => request("/me/reports", { method: "POST", body: JSON.stringify(p) }),
    listConsentPurposes: () => request("/me/consent-purposes"),
    listConsents: () => request("/me/consents"),
    grantConsent: (code, version) => request("/me/consents", { method: "POST", body: JSON.stringify({ code, version }) }),
    withdrawConsent: (id) => request(`/me/consents/${id}/withdraw`, { method: "POST" }),
    listActivity: notYet("Activity feed"),
    updateProfile: (i) => request("/me/profile", { method: "PATCH", body: JSON.stringify(i) }),
    getNotificationPreferences: () => request("/me/notification-preferences"),
    markAllNotificationsRead: notYet("Mark all notifications read"),
    setFeature: notYet("Feature toggles"),
    listCheckIns: () => request("/me/check-ins"),
    createCheckIn: (i) =>
      request("/me/check-ins", { method: "POST", body: JSON.stringify({ questionnaire_version: "wellbeing-v1", ...i }) }),
    listConversations: () => request("/assistant/conversations"),
    createConversation: () => request("/assistant/conversations", { method: "POST", body: "{}" }),
    sendAssistantMessage: (id, text) =>
      request(`/assistant/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ message: text }) }),
    listConsultations: () => request("/consultations"),
    requestConsultation: (i) => request("/consultations", { method: "POST", body: JSON.stringify(i) }),
    cancelConsultation: (id) => request(`/consultations/${id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }),
    listAssignedCitizens: () => request("/provider/assigned-citizens"),
    getCitizenOverview: (id) => request(`/provider/citizens/${id}/overview`),
    createFollowUp: (id, i) => request(`/provider/citizens/${id}/follow-ups`, { method: "POST", body: JSON.stringify(i) }),
    listDeviceSources: notYet("Device connections"),
    listRegionalIndicators: notYet("Regional health map"),
    listDataExports: () => request("/me/data-exports"),
    requestDataExport: () => request("/me/data-exports", { method: "POST" }),
    requestAccountDeletion: () =>
      request("/me/account-deletion-requests", { method: "POST", body: JSON.stringify({ confirm: true }) }),
    updateNotificationPreferences: (i) =>
      request("/me/notification-preferences", { method: "PATCH", body: JSON.stringify(i) }),
  };
}

export const api: AlboApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? createLiveApi(process.env.NEXT_PUBLIC_API_BASE_URL ?? "")
    : createMockApi();
