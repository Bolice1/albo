/**
 * SYNTHETIC development fixtures. No real people, records, or facilities.
 * Names and facilities are fictional (AGENTS.md rules 8–9, ADR-007).
 * Dates are generated relative to "now" so freshness states stay realistic.
 */
import type {
  ActivityEvent,
  ConsentPurpose,
  ConsentRecord,
  AssignedCitizen,
  AssistantConversation,
  Consultation,
  DeviceSource,
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

export const CHECK_IN_DISCLAIMER =
  "Wellbeing check-ins support personal reflection and preventive awareness only. They are not a clinical or mental-health diagnosis.";
export const ASSISTANT_DISCLAIMER =
  "I'm an AI support tool, not a doctor or an emergency service. I can't diagnose or prescribe.";
export const CONSULTATION_NOTICE =
  "Albo only helps you request and schedule a consultation. The consultation itself happens with the provider.";

export function createMockDb() {
  const me: Me = {
    id: "usr_synthetic_001",
    display_name: "Demo Citizen",
    handle: "demo_citizen",
    roles: ["citizen"],
  };

  // Development mirrors ADR-017: gated modules are testable on synthetic data. Toggle in Settings → Feature previews.
  const features: FeatureFlags = {
    checkins: true,
    assistant: true,
    provider_portal: true,
    consultations: true,
    later_previews: true,
  };

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
    {
      id: "ntf_003",
      category: "system",
      title: "Indicator recalculated",
      body: "Your preventive indicator was updated using your latest inputs.",
      created_at: ago(4 * DAY),
      read_at: ago(4 * DAY),
    },
    {
      id: "ntf_004",
      category: "reminder",
      title: "Referral acknowledged",
      body: "Riverside Demo Health Post received your contact request.",
      created_at: ago(9 * DAY),
      read_at: ago(8 * DAY),
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
      code: "wellbeing_check_ins",
      version: "v1",
      title: "Save my wellbeing check-ins",
      description: "Lets Albo store short check-ins about stress, tiredness and sleep so you can see how you feel over time.",
      data_involved: "Check-in answers (0–4 scales)",
      required: false,
    },
    {
      code: "assistant_conversations",
      version: "v1",
      title: "Use the Albo assistant",
      description: "Lets the AI support tool read your latest indicator summary to explain it. Conversations are kept briefly.",
      data_involved: "Your messages and indicator summary",
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
    { id: "cns_006", purpose_code: "wellbeing_check_ins", version: "v1", status: "granted", granted_at: ago(20 * DAY), withdrawn_at: null },
    { id: "cns_007", purpose_code: "assistant_conversations", version: "v1", status: "granted", granted_at: ago(20 * DAY), withdrawn_at: null },
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

  const dataExports: DataExport[] = [
    {
      id: "exp_001",
      status: "expired",
      requested_at: ago(60 * DAY),
      completed_at: ago(60 * DAY),
      expires_at: ago(53 * DAY),
    },
  ];
  const deletionRequest: AccountDeletionRequest | null = null;

  const checkIns: WellbeingCheckIn[] = [
    {
      id: "chk_002",
      questionnaire_version: "wellbeing-v1",
      responses: { stress_frequency_score: 2, exhaustion_score: 2, sleep_quality_score: 3 },
      completed_at: ago(3 * DAY),
      safety_status: "routine",
      escalation_required: false,
      non_diagnostic_disclaimer: CHECK_IN_DISCLAIMER,
      crisis_escalation: null,
    },
    {
      id: "chk_001",
      questionnaire_version: "wellbeing-v1",
      responses: { stress_frequency_score: 3, exhaustion_score: 3, sleep_quality_score: 1 },
      completed_at: ago(10 * DAY),
      safety_status: "elevated",
      escalation_required: false,
      non_diagnostic_disclaimer: CHECK_IN_DISCLAIMER,
      crisis_escalation: null,
    },
  ];

  const conversations: AssistantConversation[] = [
    {
      id: "cnv_001",
      title: "Understanding my indicator",
      status: "active",
      last_message_at: ago(2 * DAY),
      turns: [
        { id: "trn_1", role: "user", text: "What does my moderate indicator mean?", created_at: ago(2 * DAY) },
        {
          id: "trn_2",
          role: "assistant",
          text:
            "Albo identified a moderate preventive risk indicator based on the information you shared. The main factors were your weekly activity and fruit and vegetable intake. This is not a diagnosis. A practical next step is adding a little more activity each week and keeping your inputs up to date.",
          created_at: ago(2 * DAY),
          response_type: "explanation",
          disclaimer: ASSISTANT_DISCLAIMER,
          referenced_assessment_id: "ras_003",
          rule_model_version: "rules-v1.0.0",
          suggested_actions: ["view_risk_detail", "view_facilities"],
        },
      ],
    },
  ];

  const consultations: Consultation[] = [
    {
      id: "cns_req_001",
      provider_name: "Demo Nurse Practitioner",
      organization_name: "Demo Hills Health Centre",
      status: "scheduled",
      purpose: "Preventive lifestyle review",
      requested_for_at: ahead(4 * DAY),
      scheduled_at: ahead(5 * DAY),
      workflow_notice: CONSULTATION_NOTICE,
      created_at: ago(2 * DAY),
    },
  ];

  const assignedCitizens: AssignedCitizen[] = [
    {
      assignment_id: "asg_001",
      citizen_user_id: "usr_synthetic_101",
      display_name: "Synthetic Person A",
      administrative_area: "Demo District North",
      organization_name: "Demo Hills Health Centre",
      allowed_scopes: ["health_inputs", "risk_assessments", "follow_ups"],
      starts_at: ago(40 * DAY),
      ends_at: ahead(50 * DAY),
      latest_level: "moderate",
      latest_status: "complete",
    },
    {
      assignment_id: "asg_002",
      citizen_user_id: "usr_synthetic_102",
      display_name: "Synthetic Person B",
      administrative_area: "Demo District East",
      organization_name: "Demo Hills Health Centre",
      allowed_scopes: ["health_inputs", "risk_assessments"],
      starts_at: ago(12 * DAY),
      ends_at: null,
      latest_level: null,
      latest_status: "limited",
    },
    {
      assignment_id: "asg_003",
      citizen_user_id: "usr_synthetic_103",
      display_name: "Synthetic Person C",
      administrative_area: "Demo District North",
      organization_name: "Demo Hills Health Centre",
      allowed_scopes: ["risk_assessments", "follow_ups"],
      starts_at: ago(5 * DAY),
      ends_at: ahead(85 * DAY),
      latest_level: "low",
      latest_status: "complete",
    },
  ];

  const followUps: Record<string, ProviderFollowUp[]> = {
    usr_synthetic_101: [
      {
        id: "fup_001",
        action_type: "lifestyle_counselling",
        note: "Discussed small weekly activity goals. Citizen will update inputs in two weeks.",
        referenced_assessment_id: "ras_003",
        recommended_follow_up_at: ahead(14 * DAY),
        created_at: ago(6 * DAY),
        provider_name: "Demo Nurse Practitioner",
      },
    ],
  };

  const devices: DeviceSource[] = [
    { code: "apple_health", name: "Apple Health", data_types: ["Steps", "Sleep", "Active minutes"], status: "planned" },
    { code: "google_fit", name: "Google Fit", data_types: ["Steps", "Heart points", "Sleep"], status: "planned" },
    { code: "fitbit", name: "Fitbit", data_types: ["Steps", "Sleep", "Resting heart rate"], status: "not_available" },
  ];

  const regional: RegionalIndicator[] = [
    { area_code: "DD-N", area_name: "Demo District North", elevated_share: 0.18, population_band: "10k–50k", location: { lat: -1.93, lng: 30.06 }, suppressed: false },
    { area_code: "DD-E", area_name: "Demo District East", elevated_share: 0.27, population_band: "50k–100k", location: { lat: -1.96, lng: 30.13 }, suppressed: false },
    { area_code: "DD-S", area_name: "Demo District South", elevated_share: 0.12, population_band: "10k–50k", location: { lat: -2.0, lng: 30.07 }, suppressed: false },
    { area_code: "DD-W", area_name: "Demo District West", elevated_share: null, population_band: "< 1k", location: { lat: -1.95, lng: 29.99 }, suppressed: true },
  ];

  return {
    me,
    checkIns,
    conversations,
    consultations,
    assignedCitizens,
    followUps,
    devices,
    regional,
    notificationPreferences,
    dataExports,
    deletionRequest: deletionRequest as AccountDeletionRequest | null,
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
