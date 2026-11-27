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
import { createMockDb, type MockDb } from "./mock-data";
import type {
  ActivityEvent,
  ConsentPurpose,
  ConsentRecord,
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
}

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
  };
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
    updateNotificationPreferences: (i) =>
      request("/me/notification-preferences", { method: "PATCH", body: JSON.stringify(i) }),
  };
}

export const api: AlboApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? createLiveApi(process.env.NEXT_PUBLIC_API_BASE_URL ?? "")
    : createMockApi();
