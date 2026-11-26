"""Draft rule specification: respiratory_air_quality_preventive — rules-v0.1.0-draft."""

from __future__ import annotations

from typing import Final

from data_processing.types import InputFieldSpec, NormalizedFieldValue

from risk_engine.spec import (
    EvaluatedFactor,
    LevelThresholdBand,
    NextStepTemplate,
    RuleSetSpec,
)


def _eval_pm25(item: NormalizedFieldValue) -> EvaluatedFactor:
    pm25 = float(item.value)
    if pm25 > 55.4:
        return EvaluatedFactor(
            factor_code="regional_pm25_elevated_high",
            source_field=item.field_code,
            points=3.0,
            direction="increases_risk",
            explanation_key="factor.pm25.high",
            floor_level="moderate",
        )
    if pm25 > 15.0:
        return EvaluatedFactor(
            factor_code="regional_pm25_above_guideline",
            source_field=item.field_code,
            points=2.0,
            direction="increases_risk",
            explanation_key="factor.pm25.moderate",
        )
    return EvaluatedFactor(
        factor_code="regional_pm25_within_guideline",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.pm25.good",
    )


def _eval_outdoor_exertion(item: NormalizedFieldValue) -> EvaluatedFactor:
    hours = float(item.value)
    if hours >= 4.0:
        return EvaluatedFactor(
            factor_code="prolonged_outdoor_exertion",
            source_field=item.field_code,
            points=2.0,
            direction="increases_risk",
            explanation_key="factor.outdoor_exertion.high",
        )
    if hours >= 2.0:
        return EvaluatedFactor(
            factor_code="moderate_outdoor_exertion",
            source_field=item.field_code,
            points=1.0,
            direction="increases_risk",
            explanation_key="factor.outdoor_exertion.moderate",
        )
    return EvaluatedFactor(
        factor_code="limited_outdoor_exertion",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.outdoor_exertion.low",
    )


def _eval_indoor_smoke(item: NormalizedFieldValue) -> EvaluatedFactor:
    exposed = str(item.value)
    if exposed == "yes":
        return EvaluatedFactor(
            factor_code="indoor_solid_fuel_smoke_exposure_present",
            source_field=item.field_code,
            points=2.0,
            direction="increases_risk",
            explanation_key="factor.indoor_smoke.yes",
        )
    return EvaluatedFactor(
        factor_code="reduced_indoor_smoke_exposure",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.indoor_smoke.no",
    )


RESPIRATORY_AIR_QUALITY_V0_1_0_SPEC: Final[RuleSetSpec] = RuleSetSpec(
    use_case_code="respiratory_air_quality_preventive",
    rule_model_version="rules-v0.1.0-draft",
    name="Preventive respiratory and air-quality exposure indicator",
    implementation_type="weighted_score",
    approval_status="draft",
    guideline_references=(
        "WHO Global Air Quality Guidelines (2021)",
        "WHO Household Air Pollution and Health Preventive Guidance",
    ),
    intended_use=(
        "Summarize regional PM2.5 observations and self-reported outdoor exertion and indoor "
        "smoke exposure for preventive respiratory awareness."
    ),
    excluded_use=(
        "Not a diagnosis of asthma, COPD, pneumonia, or respiratory infection; never used "
        "to prescribe inhalers or clinical treatment."
    ),
    fields=(
        InputFieldSpec(
            field_code="pm25",
            domain="environmental_observation",
            required=True,
            max_age_hours=24.0,
            allowed_sources=("verified_environmental_adapter",),
            allowed_units=("ug/m3", "µg/m³"),
            min_value=0.0,
            max_value=1000.0,
        ),
        InputFieldSpec(
            field_code="outdoor_exertion_hours_per_day",
            domain="health_input",
            required=True,
            max_age_hours=720.0,
            allowed_sources=("self_reported",),
            allowed_units=("hours/day", "h/day"),
            min_value=0.0,
            max_value=24.0,
        ),
        InputFieldSpec(
            field_code="indoor_solid_fuel_smoke_exposure",
            domain="health_input",
            required=True,
            max_age_hours=720.0,
            allowed_sources=("self_reported",),
            allowed_units=("boolean_flag", "category", "status"),
            enum_values=("yes", "no"),
        ),
    ),
    factor_evaluators=(
        ("pm25", _eval_pm25),
        ("outdoor_exertion_hours_per_day", _eval_outdoor_exertion),
        ("indoor_solid_fuel_smoke_exposure", _eval_indoor_smoke),
    ),
    level_thresholds=(
        LevelThresholdBand(
            level="low",
            min_points=0.0,
            max_points=1.0,
            summary_code="low_air_exposure_threshold_met",
        ),
        LevelThresholdBand(
            level="moderate",
            min_points=2.0,
            max_points=4.0,
            summary_code="moderate_air_exposure_threshold_met",
        ),
        LevelThresholdBand(
            level="high",
            min_points=5.0,
            max_points=None,
            summary_code="high_air_exposure_threshold_met",
        ),
    ),
    base_limitation=(
        "This is a preventive air-quality exposure indicator based on regional PM2.5 data "
        "and self-reported habits, not a clinical respiratory diagnosis."
    ),
    provenance_limitation=(
        "PM2.5 values reflect regional air-quality monitoring rather than personal "
        "dosimetry, combined with self-reported household and outdoor habits."
    ),
    next_steps_by_level={
        "low": (
            NextStepTemplate(
                action_code="maintain_clean_air_and_ventilation_habits",
                priority="routine",
            ),
        ),
        "moderate": (
            NextStepTemplate(
                action_code="reduce_peak_pollution_exertion_and_ventilate_cooking_areas",
                priority="standard",
            ),
        ),
        "high": (
            NextStepTemplate(
                action_code="limit_heavy_outdoor_exertion_and_reduce_indoor_smoke",
                priority="timely",
            ),
            NextStepTemplate(
                action_code="consult_healthcare_facility_if_breathing_symptoms_occur",
                priority="timely",
                facility_service_tags=("primary_care", "respiratory_care"),
            ),
        ),
    },
    factor_specific_next_steps={
        "indoor_solid_fuel_smoke_exposure_present": NextStepTemplate(
            action_code="improve_kitchen_ventilation_during_cooking",
            priority="standard",
        ),
    },
    high_risk_facility_tags=("primary_care", "respiratory_care"),
)
