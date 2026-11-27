/**
 * SYNTHETIC development fixtures. No real people, records, or facilities.
 * Names and facilities are fictional (AGENTS.md rules 8–9, ADR-007).
 * Dates are generated relative to "now" so freshness states stay realistic.
 */
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
  Referral,
  Report,
  RiskAssessment,
  TrendSeries,
} from "./types";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();
const todayAt = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export function createMockDb() {
  const me: Me = {
    id: "usr_synthetic_001",
    display_name: "Demo Citizen",
    handle: "demo_citizen",
    roles: ["citizen"],
  };

  const features: FeatureFlags = { checkins: false, assistant: false, provider_portal: false };

  const healthInputs: HealthInput[] = [
    {
      id: "hin_001",
      field_code: "physical_activity_minutes_per_week",
      category: "activity",
      value: 120,
      unit: "min/week",
      source: "self_reported",
      status: "active",
      observed_at: ago(4 * DAY),
      created_at: ago(4 * DAY),
      supersedes_input_id: "hin_000",
    },
    {
      id: "hin_000",
      field_code: "physical_activity_minutes_per_week",
      category: "activity",
      value: 60,
      unit: "min/week",
      source: "self_reported",
      status: "superseded",
      observed_at: ago(40 * DAY),
      created_at: ago(40 * DAY),
      supersedes_input_id: null,
    },
    {
      id: "hin_002",
      field_code: "tobacco_use_status",
      category: "lifestyle",
      value: "never",
      unit: null,
      source: "self_reported",
      status: "active",
      observed_at: ago(12 * DAY),
      created_at: ago(12 * DAY),
      supersedes_input_id: null,
    },
    {
      id: "hin_003",
      field_code: "sleep_hours_avg",
      category: "sleep",
      value: 6.5,
      unit: "hours/day",
      source: "self_reported",
      status: "active",
      observed_at: ago(26 * DAY),
      created_at: ago(26 * DAY),
      supersedes_input_id: null,
    },
    {
      id: "hin_004",
      field_code: "diet_fruit_veg_servings_per_day",
      category: "diet",
      value: 2,
      unit: "servings/day",
      source: "self_reported",
      status: "active",
      observed_at: ago(34 * DAY),
      created_at: ago(34 * DAY),
      supersedes_input_id: null,
    },
  ];

  const riskAssessments: RiskAssessment[] = [
    {
      id: "ras_003",
      use_case: "lifestyle_ncd_preventive",
      status: "complete",
      level: "moderate",
      calculated_at: todayAt(7, 30),
      rule_model_version: "rules-v1.0.0",
      contributing_factors: [
        { code: "low_fruit_veg", label: "Fruit and vegetable intake below recommended servings", direction: "raises" },
        { code: "activity_below_target", label: "Weekly activity below 150 minutes", direction: "raises" },
        { code: "no_tobacco", label: "No tobacco use reported", direction: "lowers" },
      ],
      limitations: [
        "This is a preventive risk indicator based on self-reported lifestyle information, not a medical diagnosis.",
        "It does not include blood pressure, blood sugar, family history, or clinical examination.",
      ],
      recommended_next_steps: [
        "Consider adding more fruit and vegetables to daily meals.",
        "Aim to build up to at least 150 minutes of moderate activity per week.",
        "If you have concerns, discuss a routine check-up with a health centre.",
      ],
    },
    {
      id: "ras_002",
      use_case: "lifestyle_ncd_preventive",
      status: "limited",
      level: null,
      calculated_at: ago(35 * DAY),
      rule_model_version: "rules-v1.0.0",
      contributing_factors: [],
      limitations: [
        "Albo could not calculate this indicator because required information was missing or out of date.",
      ],
      recommended_next_steps: ["Update your health inputs so Albo can calculate this indicator."],
      missing_inputs: ["sleep_hours_avg", "diet_fruit_veg_servings_per_day"],
    },
    {
      id: "ras_001",
      use_case: "lifestyle_ncd_preventive",
      status: "complete",
      level: "low",
      calculated_at: ago(70 * DAY),
      rule_model_version: "rules-v1.0.0",
      contributing_factors: [{ code: "no_tobacco", label: "No tobacco use reported", direction: "lowers" }],
      limitations: [
        "This is a preventive risk indicator based on self-reported lifestyle information, not a medical diagnosis.",
      ],
      recommended_next_steps: ["Keep your health inputs up to date."],
    },
  ];

  const facilities: Facility[] = [
    {
      id: "fac_001",
      name: "Demo Hills Health Centre",
      type: "Health centre",
      services: ["General consultation", "Immunisation", "NCD screening"],
      address: "Synthetic Road 12, Sector A",
      contact: "+250 700 000 001",
      location: { lat: -1.944, lng: 30.061 },
      source: "Synthetic directory",
      last_verified_at: ago(6 * DAY),
    },
    {
      id: "fac_002",
      name: "Lakeside Demo Clinic",
      type: "Clinic",
      services: ["General consultation", "Maternal health"],
      address: "Synthetic Avenue 4, Sector B",
      contact: "+250 700 000 002",
      location: { lat: -1.958, lng: 30.092 },
      source: "Synthetic directory",
      last_verified_at: ago(20 * DAY),
    },
    {
      id: "fac_003",
      name: "Valley Demo Pharmacy",
      type: "Pharmacy",
      services: ["Pharmacy", "Health advice"],
      address: "Synthetic Street 31, Sector C",
      contact: null,
      location: { lat: -1.931, lng: 30.112 },
      source: "Synthetic directory",
      last_verified_at: ago(2 * DAY),
    },
    {
      id: "fac_004",
      name: "Northgate Demo District Hospital",
      type: "District hospital",
      services: ["Emergency", "Inpatient", "Laboratory", "NCD clinic"],
      address: "Synthetic Boulevard 1, Sector D",
      contact: "+250 700 000 004",
      location: { lat: -1.918, lng: 30.074 },
      source: "Synthetic directory",
      last_verified_at: ago(95 * DAY),
    },
    {
      id: "fac_005",
      name: "Riverside Demo Health Post",
      type: "Health post",
      services: ["General consultation", "Community health"],
      address: "Synthetic Lane 9, Sector E",
      contact: "+250 700 000 005",
      location: { lat: -1.972, lng: 30.048 },
      source: "Synthetic directory",
      last_verified_at: ago(11 * DAY),
    },
  ];

  const referrals: Referral[] = [
    {
      id: "ref_001",
      facility_id: "fac_001",
      facility_name: "Demo Hills Health Centre",
      reason_category: "Routine check-up",
      status: "acknowledged",
      requested_at: ago(2 * DAY),
      preferred_date: ahead(2 * DAY),
    },
    {
      id: "ref_002",
      facility_id: "fac_005",
      facility_name: "Riverside Demo Health Post",
      reason_category: "Lifestyle guidance",
      status: "requested",
      requested_at: ago(6 * HOUR),
      preferred_date: ahead(9 * DAY),
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: "ntf_001",
      category: "reminder",
      title: "Some inputs are getting old",
      body: "Your fruit & vegetable input is out of date. Updating it helps Albo calculate your indicators.",
      created_at: ago(3 * HOUR),
      read_at: null,
    },
    {
      id: "ntf_002",
      category: "report",
      title: "Your report is ready",
      body: "The report you requested is ready to download.",
      created_at: ago(2 * DAY),
      read_at: null,
    },
  ];

  const trends: TrendSeries[] = [
    {
      field_code: "physical_activity_minutes_per_week",
      unit: "min",
      points: [35, 0, 20, 45, null, 30, 15].map((v, i) => ({
        date: new Date(Date.now() - (6 - i) * DAY).toISOString().slice(0, 10),
        value: v,
      })),
    },
  ];

  const environment: EnvironmentObservation[] = [
    {
      id: "env_001",
      metric: "air_quality_pm25",
      label: "Air quality (PM2.5)",
      value: 18,
      unit: "µg/m³",
      area_label: "Your area",
      source: "Sandbox weather adapter",
      observed_at: ago(2 * HOUR),
    },
    {
      id: "env_002",
      metric: "temperature",
      label: "Temperature",
      value: 24,
      unit: "°C",
      area_label: "Your area",
      source: "Sandbox weather adapter",
      observed_at: ago(2 * HOUR),
    },
    {
      id: "env_003",
      metric: "rainfall_24h",
      label: "Rainfall (24 h)",
      value: 6,
      unit: "mm",
      area_label: "Your area",
      source: "Sandbox weather adapter",
      observed_at: ago(30 * HOUR),
    },
  ];

  const reports: Report[] = [
    {
      id: "rep_002",
      status: "ready",
      period_start: ago(90 * DAY).slice(0, 10),
      period_end: ago(0).slice(0, 10),
      requested_at: ago(2 * DAY),
      completed_at: ago(2 * DAY - 5 * 60_000),
    },
    {
      id: "rep_001",
      status: "expired",
      period_start: ago(180 * DAY).slice(0, 10),
      period_end: ago(90 * DAY).slice(0, 10),
      requested_at: ago(60 * DAY),
      completed_at: ago(60 * DAY),
    },
  ];

  const consentPurposes: ConsentPurpose[] = [
    {
      code: "health_input_storage",
      version: "v1",
      title: "Store my health inputs",
      description: "Lets Albo save the lifestyle information you enter so you can review and update it.",
      data_involved: "Activity, sleep, diet and tobacco-use answers",
      required: true,
    },
    {
      code: "preventive_risk_calculation",
      version: "v1",
      title: "Calculate preventive indicators",
      description: "Lets Albo use your saved inputs to calculate explainable preventive risk indicators.",
      data_involved: "Your saved health inputs",
      required: false,
    },
    {
      code: "environmental_context",
      version: "v1",
      title: "Show environmental context",
      description: "Shows area-level weather and air quality for your general area.",
      data_involved: "Approximate area only",
      required: false,
    },
    {
      code: "facility_location_search",
      version: "v1",
      title: "Use my location to find care",
      description: "Uses an approximate location you choose to sort nearby facilities. Not stored precisely.",
      data_involved: "Approximate location at search time",
      required: false,
    },
    {
      code: "notifications_delivery",
      version: "v1",
      title: "Send me notifications",
      description: "Reminders and alerts you choose in notification settings.",
      data_involved: "Notification preferences",
      required: false,
    },
    {
      code: "report_generation",
      version: "v1",
      title: "Generate personal reports",
      description: "Creates a private, downloadable summary of your information for a period you choose.",
      data_involved: "Inputs, indicators and their provenance",
      required: false,
    },
    {
      code: "provider_data_sharing",
      version: "v1",
      title: "Share with an assigned provider",
      description: "Lets a provider assigned to you view your inputs and indicators.",
      data_involved: "Inputs and indicators",
      required: false,
    },
  ];

  const consents: ConsentRecord[] = [
    { id: "cns_001", purpose_code: "health_input_storage", version: "v1", status: "granted", granted_at: ago(80 * DAY), withdrawn_at: null },
    { id: "cns_002", purpose_code: "preventive_risk_calculation", version: "v1", status: "granted", granted_at: ago(80 * DAY), withdrawn_at: null },
    { id: "cns_003", purpose_code: "environmental_context", version: "v1", status: "granted", granted_at: ago(80 * DAY), withdrawn_at: null },
    { id: "cns_004", purpose_code: "report_generation", version: "v1", status: "granted", granted_at: ago(10 * DAY), withdrawn_at: null },
    { id: "cns_005", purpose_code: "notifications_delivery", version: "v1", status: "withdrawn", granted_at: ago(80 * DAY), withdrawn_at: ago(30 * DAY) },
  ];

  const activity: ActivityEvent[] = [
    { id: "act_1", kind: "health_input", label: "Activity updated", detail: "120 min/week", at: todayAt(6, 45), outcome: "done" },
    { id: "act_2", kind: "risk_assessment", label: "Indicator calculated", detail: "Moderate · rules-v1.0.0", at: todayAt(7, 30), outcome: "done" },
    { id: "act_3", kind: "notification", label: "Reminder", detail: "Inputs getting old", at: todayAt(11, 0), outcome: "done" },
    { id: "act_4", kind: "referral", label: "Referral requested", detail: "Riverside Demo Health Post", at: todayAt(14, 20), outcome: "pending" },
    { id: "act_5", kind: "health_input", label: "Diet input due", detail: "Out of date", at: todayAt(19, 0), outcome: "limited" },
  ];

  const notificationPreferences: NotificationPreferences = {
    in_app_enabled: true,
    email_enabled: false,
    sms_enabled: false,
    push_enabled: false,
    enabled_categories: ["risk_indicator_update", "report_ready"],
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
    updated_at: ago(30 * DAY),
  };

  return {
    me,
    notificationPreferences,
    features,
    healthInputs,
    riskAssessments,
    facilities,
    referrals,
    notifications,
    trends,
    environment,
    reports,
    consentPurposes,
    consents,
    activity,
  };
}

export type MockDb = ReturnType<typeof createMockDb>;
