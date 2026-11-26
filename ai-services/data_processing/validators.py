"""Wall-clock-independent completeness, physiological bound, and freshness validators."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from app.contracts.common import ErrorDetail
from app.contracts.risk_assessment import (
    CheckInResponseItem,
    EnvironmentalObservationItem,
    HealthInputItem,
    RiskCalculationRequest,
)
from app.errors import InvalidInputRangeError

from data_processing.types import (
    InputFieldSpec,
    NormalizedFieldValue,
    ScalarInputValue,
    ValidatedSnapshot,
)


def _validate_value_against_spec(
    *,
    value: ScalarInputValue,
    unit: str | None,
    spec: InputFieldSpec,
    field_path: str,
    unit_path: str | None = None,
) -> list[ErrorDetail]:
    errors: list[ErrorDetail] = []

    if unit is not None and spec.allowed_units is not None and unit not in spec.allowed_units:
        errors.append(ErrorDetail(field=unit_path or field_path, reason="invalid_unit"))

    if spec.enum_values is not None:
        if not isinstance(value, str) or value not in spec.enum_values:
            errors.append(ErrorDetail(field=field_path, reason="invalid_enum_value"))
        return errors

    if isinstance(value, (str, bool)):
        errors.append(ErrorDetail(field=field_path, reason="expected_numeric_value"))
        return errors

    if spec.integer_only and isinstance(value, float):
        errors.append(ErrorDetail(field=field_path, reason="integer_required"))
        return errors

    numeric = float(value)
    if spec.min_value is not None and numeric < spec.min_value:
        errors.append(ErrorDetail(field=field_path, reason="below_minimum_range"))
    if spec.max_value is not None and numeric > spec.max_value:
        errors.append(ErrorDetail(field=field_path, reason="above_maximum_range"))

    return errors


def _collect_range_errors(
    request: RiskCalculationRequest,
    spec_by_code: dict[tuple[str, str], InputFieldSpec],
    fallback_checkin_specs: dict[str, InputFieldSpec],
) -> list[ErrorDetail]:
    range_errors: list[ErrorDetail] = []

    for idx, h_item in enumerate(request.inputs.health_inputs):
        spec = spec_by_code.get(("health_input", h_item.field_code)) or fallback_checkin_specs.get(
            h_item.field_code
        )
        if spec is not None:
            range_errors.extend(
                _validate_value_against_spec(
                    value=h_item.value,
                    unit=h_item.unit,
                    spec=spec,
                    field_path=f"inputs.health_inputs.{idx}.value",
                    unit_path=f"inputs.health_inputs.{idx}.unit",
                )
            )

    for idx, env_item in enumerate(request.inputs.environmental_observations):
        spec = spec_by_code.get(("environmental_observation", env_item.observation_type))
        if spec is not None:
            range_errors.extend(
                _validate_value_against_spec(
                    value=env_item.value,
                    unit=env_item.unit,
                    spec=spec,
                    field_path=f"inputs.environmental_observations.{idx}.value",
                    unit_path=f"inputs.environmental_observations.{idx}.unit",
                )
            )

    if request.inputs.check_in_responses is not None:
        for idx, c_item in enumerate(request.inputs.check_in_responses):
            spec = spec_by_code.get(("check_in_response", c_item.question_code))
            if spec is not None:
                range_errors.extend(
                    _validate_value_against_spec(
                        value=c_item.value,
                        unit=None,
                        spec=spec,
                        field_path=f"inputs.check_in_responses.{idx}.value",
                    )
                )

    if request.inputs.check_in_overlay is not None:
        for idx, c_item in enumerate(request.inputs.check_in_overlay):
            spec = spec_by_code.get(("check_in_response", c_item.question_code))
            if spec is not None:
                range_errors.extend(
                    _validate_value_against_spec(
                        value=c_item.value,
                        unit=None,
                        spec=spec,
                        field_path=f"inputs.check_in_overlay.{idx}.value",
                    )
                )

    return range_errors


def _select_latest_health_input(items: Sequence[HealthInputItem]) -> HealthInputItem:
    best_idx = 0
    best_item = items[0]
    for idx in range(1, len(items)):
        cand = items[idx]
        if (cand.observed_at, idx) >= (best_item.observed_at, best_idx):
            best_idx = idx
            best_item = cand
    return best_item


def _select_latest_env_obs(
    items: Sequence[EnvironmentalObservationItem],
) -> EnvironmentalObservationItem:
    best_idx = 0
    best_item = items[0]
    for idx in range(1, len(items)):
        cand = items[idx]
        if (cand.observed_at, idx) >= (best_item.observed_at, best_idx):
            best_idx = idx
            best_item = cand
    return best_item


def _select_latest_checkin(
    items: Sequence[CheckInResponseItem], default_ts: datetime
) -> tuple[CheckInResponseItem, datetime]:
    best_idx = 0
    best_item = items[0]
    best_ts = best_item.observed_at if best_item.observed_at is not None else default_ts
    for idx in range(1, len(items)):
        cand = items[idx]
        cand_ts = cand.observed_at if cand.observed_at is not None else default_ts
        if (cand_ts, idx) >= (best_ts, best_idx):
            best_idx = idx
            best_item = cand
            best_ts = cand_ts
    return best_item, best_ts


def validate_snapshot_inputs(
    request: RiskCalculationRequest,
    field_specs: Sequence[InputFieldSpec],
) -> ValidatedSnapshot:
    """Validate snapshot completeness, source provenance, physiological bounds, and freshness.

    Strictly compares `observed_at` against `request.calculated_for_timestamp` and NEVER reads
    wall-clock `datetime.now()`.
    """
    spec_by_code: dict[tuple[str, str], InputFieldSpec] = {
        (s.domain, s.field_code): s for s in field_specs
    }
    fallback_checkin_specs: dict[str, InputFieldSpec] = {
        s.field_code: s for s in field_specs if s.domain == "check_in_response"
    }

    range_errors = _collect_range_errors(request, spec_by_code, fallback_checkin_specs)
    if range_errors:
        raise InvalidInputRangeError(range_errors)

    validated_fields: dict[str, NormalizedFieldValue] = {}
    missing_or_stale: list[str] = []
    omitted_optional: list[str] = []
    reason_codes: list[str] = []
    used_self_reported = False
    used_environmental = False

    def add_reason(code: str) -> None:
        if code not in reason_codes:
            reason_codes.append(code)

    ref_timestamp = request.calculated_for_timestamp
    merged_checkins: list[CheckInResponseItem] = []
    if request.inputs.check_in_responses:
        merged_checkins.extend(request.inputs.check_in_responses)
    if request.inputs.check_in_overlay:
        merged_checkins.extend(request.inputs.check_in_overlay)

    for spec in field_specs:
        if spec.domain == "environmental_observation":
            env_matches = [
                obs
                for obs in request.inputs.environmental_observations
                if obs.observation_type == spec.field_code
            ]
            if not env_matches:
                if spec.required:
                    missing_or_stale.append(spec.field_code)
                    add_reason("ENVIRONMENTAL_SOURCE_UNAVAILABLE")
                else:
                    omitted_optional.append(spec.field_code)
                    add_reason("OPTIONAL_INPUT_OMITTED")
                continue

            chosen_env = _select_latest_env_obs(env_matches)
            if chosen_env.quality_status != "verified":
                if spec.required:
                    missing_or_stale.append(spec.field_code)
                    add_reason("ENVIRONMENTAL_SOURCE_UNAVAILABLE")
                else:
                    omitted_optional.append(spec.field_code)
                    add_reason("OPTIONAL_INPUT_OMITTED")
                continue

            age_seconds = (ref_timestamp - chosen_env.observed_at).total_seconds()
            if age_seconds < 0:
                if spec.required:
                    missing_or_stale.append(spec.field_code)
                    add_reason("FUTURE_INPUT_TIMESTAMP")
                else:
                    omitted_optional.append(spec.field_code)
                    add_reason("OPTIONAL_INPUT_OMITTED")
                continue

            if (age_seconds / 3600.0) > spec.max_age_hours:
                if spec.required:
                    missing_or_stale.append(spec.field_code)
                    add_reason("STALE_REQUIRED_INPUT")
                else:
                    omitted_optional.append(spec.field_code)
                    add_reason("OPTIONAL_INPUT_OMITTED")
                continue

            validated_fields[spec.field_code] = NormalizedFieldValue(
                field_code=spec.field_code,
                domain="environmental_observation",
                value=chosen_env.value,
                observed_at=chosen_env.observed_at,
                source_type="verified_environmental_adapter",
            )
            used_environmental = True
            continue

        if spec.domain == "check_in_response":
            c_matches = [c for c in merged_checkins if c.question_code == spec.field_code]
            if c_matches:
                chosen_c, effective_ts = _select_latest_checkin(c_matches, ref_timestamp)
                val_scalar = chosen_c.value
                src_type = chosen_c.source_type
            else:
                h_fallback = [
                    h for h in request.inputs.health_inputs if h.field_code == spec.field_code
                ]
                if not h_fallback:
                    if spec.required:
                        missing_or_stale.append(spec.field_code)
                        add_reason("MISSING_REQUIRED_INPUT")
                    else:
                        omitted_optional.append(spec.field_code)
                        add_reason("OPTIONAL_INPUT_OMITTED")
                    continue
                chosen_h_fb = _select_latest_health_input(h_fallback)
                val_scalar = chosen_h_fb.value
                effective_ts = chosen_h_fb.observed_at
                src_type = chosen_h_fb.source_type
        else:
            h_matches = [h for h in request.inputs.health_inputs if h.field_code == spec.field_code]
            if not h_matches:
                if spec.required:
                    missing_or_stale.append(spec.field_code)
                    add_reason("MISSING_REQUIRED_INPUT")
                else:
                    omitted_optional.append(spec.field_code)
                    add_reason("OPTIONAL_INPUT_OMITTED")
                continue
            chosen_h = _select_latest_health_input(h_matches)
            val_scalar = chosen_h.value
            effective_ts = chosen_h.observed_at
            src_type = chosen_h.source_type

        if src_type not in spec.allowed_sources:
            if spec.required:
                missing_or_stale.append(spec.field_code)
                add_reason("UNAPPROVED_INPUT_SOURCE")
            else:
                omitted_optional.append(spec.field_code)
                add_reason("OPTIONAL_INPUT_OMITTED")
            continue

        age_seconds = (ref_timestamp - effective_ts).total_seconds()
        if age_seconds < 0:
            if spec.required:
                missing_or_stale.append(spec.field_code)
                add_reason("FUTURE_INPUT_TIMESTAMP")
            else:
                omitted_optional.append(spec.field_code)
                add_reason("OPTIONAL_INPUT_OMITTED")
            continue

        if (age_seconds / 3600.0) > spec.max_age_hours:
            if spec.required:
                missing_or_stale.append(spec.field_code)
                add_reason("STALE_REQUIRED_INPUT")
            else:
                omitted_optional.append(spec.field_code)
                add_reason("OPTIONAL_INPUT_OMITTED")
            continue

        validated_fields[spec.field_code] = NormalizedFieldValue(
            field_code=spec.field_code,
            domain=spec.domain,
            value=val_scalar,
            observed_at=effective_ts,
            source_type=src_type,
        )
        used_self_reported = True

    return ValidatedSnapshot(
        is_complete_for_scoring=len(missing_or_stale) == 0,
        fields=validated_fields,
        missing_or_stale_fields=tuple(missing_or_stale),
        omitted_optional_fields=tuple(omitted_optional),
        reason_codes=tuple(reason_codes),
        used_self_reported=used_self_reported,
        used_environmental=used_environmental,
    )
