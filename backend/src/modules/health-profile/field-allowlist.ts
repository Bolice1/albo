import { HealthInputCategory } from '@prisma/client';
import { ErrorDetail, ValidationDomainException } from '@common/errors/app.exception';

export type HealthInputValueType = 'integer' | 'number' | 'enum';

export interface ApprovedHealthFieldSpec {
  readonly fieldCode: string;
  readonly category: HealthInputCategory;
  readonly valueType: HealthInputValueType;
  readonly min?: number;
  readonly max?: number;
  readonly enumValues?: readonly string[];
  readonly requiredUnit: string | null;
  readonly maxAgeHours: number;
}

/**
 * Centralized allowlist of approved citizen health, lifestyle, and environmental-exposure inputs.
 * Reference: MODEL_DOCUMENTATION.md §6, ADR-010, FR-007, FR-009, T-006.
 * Unapproved clinical fields (e.g., HIV status, genetic markers, raw blood biomarkers) are
 * strictly rejected with 422 VALIDATION_ERROR and zero value echoing.
 */
export const HEALTH_INPUT_FIELD_ALLOWLIST: Readonly<Record<string, ApprovedHealthFieldSpec>> = {
  physical_activity_minutes_per_week: {
    fieldCode: 'physical_activity_minutes_per_week',
    category: HealthInputCategory.activity,
    valueType: 'integer',
    min: 0,
    max: 5040,
    requiredUnit: 'min/week',
    maxAgeHours: 720,
  },
  tobacco_use_status: {
    fieldCode: 'tobacco_use_status',
    category: HealthInputCategory.lifestyle,
    valueType: 'enum',
    enumValues: ['never', 'former', 'current'],
    requiredUnit: null,
    maxAgeHours: 720,
  },
  sleep_hours_avg: {
    fieldCode: 'sleep_hours_avg',
    category: HealthInputCategory.sleep,
    valueType: 'number',
    min: 0,
    max: 24,
    requiredUnit: 'hours/day',
    maxAgeHours: 720,
  },
  diet_fruit_veg_servings_per_day: {
    fieldCode: 'diet_fruit_veg_servings_per_day',
    category: HealthInputCategory.diet,
    valueType: 'integer',
    min: 0,
    max: 20,
    requiredUnit: 'servings/day',
    maxAgeHours: 720,
  },
  bed_net_nightly_use: {
    fieldCode: 'bed_net_nightly_use',
    category: HealthInputCategory.environmental_exposure,
    valueType: 'enum',
    enumValues: ['always', 'sometimes', 'never'],
    requiredUnit: null,
    maxAgeHours: 720,
  },
  standing_water_near_home: {
    fieldCode: 'standing_water_near_home',
    category: HealthInputCategory.environmental_exposure,
    valueType: 'enum',
    enumValues: ['yes', 'no'],
    requiredUnit: null,
    maxAgeHours: 720,
  },
  outdoor_exertion_hours_per_day: {
    fieldCode: 'outdoor_exertion_hours_per_day',
    category: HealthInputCategory.environmental_exposure,
    valueType: 'number',
    min: 0,
    max: 24,
    requiredUnit: 'hours/day',
    maxAgeHours: 720,
  },
  indoor_solid_fuel_smoke_exposure: {
    fieldCode: 'indoor_solid_fuel_smoke_exposure',
    category: HealthInputCategory.environmental_exposure,
    valueType: 'enum',
    enumValues: ['yes', 'no'],
    requiredUnit: null,
    maxAgeHours: 720,
  },
  drinking_water_treatment: {
    fieldCode: 'drinking_water_treatment',
    category: HealthInputCategory.lifestyle,
    valueType: 'enum',
    enumValues: ['boiled_or_filtered', 'packaged', 'untreated'],
    requiredUnit: null,
    maxAgeHours: 720,
  },
  handwashing_with_soap_frequency: {
    fieldCode: 'handwashing_with_soap_frequency',
    category: HealthInputCategory.lifestyle,
    valueType: 'enum',
    enumValues: ['consistent', 'inconsistent'],
    requiredUnit: null,
    maxAgeHours: 720,
  },
};

export const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MIN_OBSERVED_AT_EPOCH_MS = Date.UTC(1900, 0, 1);

export interface ValidatedHealthInputPayload {
  fieldCode: string;
  category: HealthInputCategory;
  numericValue: number | null;
  textValue: string | null;
  scalarValue: number | string;
  unit: string | null;
  observedAt: Date;
}

export interface RawHealthInputCandidate {
  fieldCode: string;
  category?: HealthInputCategory;
  value?: unknown;
  numericValue?: unknown;
  textValue?: unknown;
  unit?: string | null;
  observedAt?: string;
  defaultUnit?: string | null;
  defaultObservedAt?: Date;
  now?: Date;
}

/**
 * Validates a health input payload against `HEALTH_INPUT_FIELD_ALLOWLIST` without ever
 * echoing raw field values in exception messages or details (T-006, T-017, DP-008).
 */
export function validateAllowlistedHealthInput(
  candidate: RawHealthInputCandidate,
): ValidatedHealthInputPayload {
  const spec = Object.prototype.hasOwnProperty.call(
    HEALTH_INPUT_FIELD_ALLOWLIST,
    candidate.fieldCode,
  )
    ? HEALTH_INPUT_FIELD_ALLOWLIST[candidate.fieldCode]
    : undefined;

  if (!spec) {
    throw new ValidationDomainException(
      'The request contains unapproved or invalid health input fields.',
      [{ field: 'field_code', reason: 'unapproved_field_code' }],
    );
  }

  const details: ErrorDetail[] = [];

  if (candidate.category !== undefined && candidate.category !== spec.category) {
    details.push({ field: 'category', reason: 'mismatched_category' });
  }

  const effectiveUnit =
    candidate.unit !== undefined ? candidate.unit : (candidate.defaultUnit ?? undefined);

  if (spec.requiredUnit !== null) {
    if (effectiveUnit !== spec.requiredUnit) {
      details.push({ field: 'unit', reason: 'mismatched_unit' });
    }
  } else if (effectiveUnit !== undefined && effectiveUnit !== null) {
    details.push({ field: 'unit', reason: 'mismatched_unit' });
  }

  const resolvedValue = resolveCandidateScalar(candidate, details);

  let numericValue: number | null = null;
  let textValue: string | null = null;
  let scalarValue: number | string = '';

  if (resolvedValue !== undefined) {
    if (spec.valueType === 'enum') {
      if (typeof resolvedValue !== 'string' || !spec.enumValues?.includes(resolvedValue)) {
        details.push({ field: 'value', reason: 'invalid_enum_value' });
      } else {
        textValue = resolvedValue;
        scalarValue = resolvedValue;
      }
    } else if (spec.valueType === 'integer') {
      if (
        typeof resolvedValue !== 'number' ||
        !Number.isFinite(resolvedValue) ||
        !Number.isInteger(resolvedValue)
      ) {
        details.push({ field: 'value', reason: 'invalid_integer' });
      } else if (spec.min !== undefined && resolvedValue < spec.min) {
        details.push({ field: 'value', reason: 'below_minimum' });
      } else if (spec.max !== undefined && resolvedValue > spec.max) {
        details.push({ field: 'value', reason: 'above_maximum' });
      } else {
        numericValue = resolvedValue;
        scalarValue = resolvedValue;
      }
    } else {
      if (typeof resolvedValue !== 'number' || !Number.isFinite(resolvedValue)) {
        details.push({ field: 'value', reason: 'invalid_number' });
      } else if (spec.min !== undefined && resolvedValue < spec.min) {
        details.push({ field: 'value', reason: 'below_minimum' });
      } else if (spec.max !== undefined && resolvedValue > spec.max) {
        details.push({ field: 'value', reason: 'above_maximum' });
      } else {
        numericValue = resolvedValue;
        scalarValue = resolvedValue;
      }
    }
  }

  const now = candidate.now ?? new Date();
  let observedAt: Date = candidate.defaultObservedAt ?? now;

  if (candidate.observedAt !== undefined) {
    const parsed = new Date(candidate.observedAt);
    const epochMs = parsed.getTime();
    if (Number.isNaN(epochMs) || epochMs < MIN_OBSERVED_AT_EPOCH_MS) {
      details.push({ field: 'observed_at', reason: 'invalid_observed_at' });
    } else if (epochMs > now.getTime() + MAX_FUTURE_CLOCK_SKEW_MS) {
      details.push({ field: 'observed_at', reason: 'future_timestamp_not_allowed' });
    } else {
      observedAt = parsed;
    }
  }

  if (details.length > 0) {
    throw new ValidationDomainException('The request contains invalid fields.', details);
  }

  return {
    fieldCode: spec.fieldCode,
    category: spec.category,
    numericValue,
    textValue,
    scalarValue,
    unit: spec.requiredUnit,
    observedAt,
  };
}

function resolveCandidateScalar(
  candidate: RawHealthInputCandidate,
  details: ErrorDetail[],
): unknown {
  const hasValue = candidate.value !== undefined && candidate.value !== null;
  const hasNumeric = candidate.numericValue !== undefined && candidate.numericValue !== null;
  const hasText = candidate.textValue !== undefined && candidate.textValue !== null;

  const providedCount = Number(hasValue) + Number(hasNumeric) + Number(hasText);
  if (providedCount === 0) {
    details.push({ field: 'value', reason: 'required' });
    return undefined;
  }

  if (hasNumeric && hasText) {
    details.push({ field: 'value', reason: 'conflicting_value_fields' });
    return undefined;
  }

  if (hasValue && hasNumeric && candidate.value !== candidate.numericValue) {
    details.push({ field: 'value', reason: 'conflicting_value_fields' });
    return undefined;
  }

  if (hasValue && hasText && candidate.value !== candidate.textValue) {
    details.push({ field: 'value', reason: 'conflicting_value_fields' });
    return undefined;
  }

  const picked = hasValue
    ? candidate.value
    : hasNumeric
      ? candidate.numericValue
      : candidate.textValue;

  if (typeof picked === 'boolean' || (typeof picked !== 'number' && typeof picked !== 'string')) {
    details.push({ field: 'value', reason: 'invalid_value_type' });
    return undefined;
  }

  return picked;
}
