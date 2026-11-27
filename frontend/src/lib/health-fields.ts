/**
 * Display metadata for approved health-input fields.
 *
 * Field codes, units, ranges and freshness windows mirror the backend allowlist
 * (backend/src/modules/health-profile/dto/health-profile.dto.ts). This is used
 * for presentation and friendly client-side form hints only — the backend stays
 * the authoritative validator (CODING_STANDARDS §5).
 *
 * NOTE: Only the lifestyle_ncd_preventive inputs are shown by default because
 * the docs (ADR-010) and backend allowlist currently disagree on the field set.
 * See the plan's discrepancy D5.
 */

export type FieldValueType = "integer" | "number" | "enum";

export interface HealthFieldMeta {
  code: string;
  label: string;
  category: string;
  valueType: FieldValueType;
  unit: string | null;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  maxAgeHours: number;
  helper: string;
}

export const HEALTH_FIELDS: Record<string, HealthFieldMeta> = {
  physical_activity_minutes_per_week: {
    code: "physical_activity_minutes_per_week",
    label: "Physical activity",
    category: "Activity",
    valueType: "integer",
    unit: "min/week",
    min: 0,
    max: 5040,
    maxAgeHours: 720,
    helper: "Minutes of moderate activity in a typical week.",
  },
  tobacco_use_status: {
    code: "tobacco_use_status",
    label: "Tobacco use",
    category: "Lifestyle",
    valueType: "enum",
    unit: null,
    options: [
      { value: "never", label: "Never" },
      { value: "former", label: "Former" },
      { value: "current", label: "Current" },
    ],
    maxAgeHours: 720,
    helper: "Your current tobacco use.",
  },
  sleep_hours_avg: {
    code: "sleep_hours_avg",
    label: "Average sleep",
    category: "Sleep",
    valueType: "number",
    unit: "hours/day",
    min: 0,
    max: 24,
    maxAgeHours: 720,
    helper: "Average hours of sleep per night.",
  },
  diet_fruit_veg_servings_per_day: {
    code: "diet_fruit_veg_servings_per_day",
    label: "Fruit & vegetables",
    category: "Diet",
    valueType: "integer",
    unit: "servings/day",
    min: 0,
    max: 20,
    maxAgeHours: 720,
    helper: "Servings of fruit and vegetables per day.",
  },
};

export const PRIMARY_FIELD_CODES = Object.keys(HEALTH_FIELDS);

export function fieldLabel(code: string): string {
  return HEALTH_FIELDS[code]?.label ?? code.replace(/_/g, " ");
}

export function formatInputValue(code: string, value: number | string, unit: string | null): string {
  const meta = HEALTH_FIELDS[code];
  if (meta?.options) {
    return meta.options.find((o) => o.value === value)?.label ?? String(value);
  }
  return unit ? `${value} ${unit}` : String(value);
}

/** Client-side hint validation. Returns an error message or null. */
export function validateFieldValue(code: string, raw: string): string | null {
  const meta = HEALTH_FIELDS[code];
  if (!meta) return "This field is not available.";
  if (raw.trim() === "") return "Enter a value.";
  if (meta.valueType === "enum") {
    return meta.options?.some((o) => o.value === raw) ? null : "Choose one of the options.";
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Enter a number.";
  if (meta.valueType === "integer" && !Number.isInteger(n)) return "Enter a whole number.";
  if (meta.min !== undefined && n < meta.min) return `Must be at least ${meta.min}.`;
  if (meta.max !== undefined && n > meta.max) return `Must be at most ${meta.max}.`;
  return null;
}
