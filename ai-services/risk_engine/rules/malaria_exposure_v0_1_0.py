"""Draft rule specification: malaria_exposure_preventive — rules-v0.1.0-draft."""

from __future__ import annotations

from typing import Final

from data_processing.types import InputFieldSpec, NormalizedFieldValue

from risk_engine.spec import (
    EvaluatedFactor,
    LevelThresholdBand,
    NextStepTemplate,
    RuleSetSpec,
)


def _eval_rainfall(item: NormalizedFieldValue) -> EvaluatedFactor:
    mm = float(item.value)
    if mm >= 50.0:
        return EvaluatedFactor(
            factor_code="recent_heavy_rainfall_exposure",
            source_field=item.field_code,
            points=2.0,
            direction="increases_risk",
            explanation_key="factor.rainfall.elevated",
        )
    if mm >= 20.0:
        return EvaluatedFactor(
            factor_code="moderate_rainfall_exposure",
            source_field=item.field_code,
            points=1.0,
            direction="increases_risk",
            explanation_key="factor.rainfall.moderate",
        )
    return EvaluatedFactor(
        factor_code="low_rainfall_exposure",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.rainfall.low",
    )


def _eval_temperature(item: NormalizedFieldValue) -> EvaluatedFactor:
    celsius = float(item.value)
    if 18.0 <= celsius <= 32.0:
        return EvaluatedFactor(
            factor_code="vector_favorable_temperature_band",
            source_field=item.field_code,
            points=1.0,
            direction="increases_risk",
            explanation_key="factor.temperature.vector_favorable",
        )
    return EvaluatedFactor(
        factor_code="temperature_outside_peak_vector_band",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.temperature.outside_peak_band",
    )


def _eval_bed_net(item: NormalizedFieldValue) -> EvaluatedFactor:
    usage = str(item.value)
    if usage == "never":
        return EvaluatedFactor(
            factor_code="no_insecticide_treated_net_use",
            source_field=item.field_code,
            points=2.0,
            direction="increases_risk",
            explanation_key="factor.bed_net.never",
            floor_level="moderate",
        )
    if usage == "sometimes":
        return EvaluatedFactor(
            factor_code="inconsistent_bed_net_use",
            source_field=item.field_code,
            points=1.0,
            direction="increases_risk",
            explanation_key="factor.bed_net.sometimes",
        )
    return EvaluatedFactor(
        factor_code="consistent_bed_net_use",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.bed_net.always",
    )


def _eval_standing_water(item: NormalizedFieldValue) -> EvaluatedFactor:
    present = str(item.value)
    if present == "yes":
        return EvaluatedFactor(
            factor_code="standing_water_near_home_present",
            source_field=item.field_code,
            points=2.0,
            direction="increases_risk",
            explanation_key="factor.standing_water.yes",
        )
    return EvaluatedFactor(
        factor_code="no_standing_water_near_home",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.standing_water.no",
    )


MALARIA_EXPOSURE_V0_1_0_SPEC: Final[RuleSetSpec] = RuleSetSpec(
    use_case_code="malaria_exposure_preventive",
    rule_model_version="rules-v0.1.0-draft",
    name="Preventive malaria environmental and household exposure indicator",
    implementation_type="weighted_score",
    approval_status="draft",
    guideline_references=(
        "WHO Guidelines for Malaria Vector Control",
        "Rwanda Biomedical Centre (RBC) Malaria Prevention Guidance",
    ),
    intended_use=(
        "Highlight modifiable household mosquito-prevention practices alongside regional "
        "rainfall and temperature context."
    ),
    excluded_use=(
        "Not a malaria test or clinical diagnosis; anyone with fever must seek prompt "
        "clinical testing rather than relying on an exposure indicator."
    ),
    fields=(
        InputFieldSpec(
            field_code="rainfall",
            domain="environmental_observation",
            required=True,
            max_age_hours=168.0,
            allowed_sources=("verified_environmental_adapter",),
            allowed_units=("mm",),
            min_value=0.0,
            max_value=2000.0,
        ),
        InputFieldSpec(
            field_code="temperature",
            domain="environmental_observation",
            required=True,
            max_age_hours=168.0,
            allowed_sources=("verified_environmental_adapter",),
            allowed_units=("C", "celsius", "degC", "°C"),
            min_value=-10.0,
            max_value=55.0,
        ),
        InputFieldSpec(
            field_code="bed_net_nightly_use",
            domain="health_input",
            required=True,
            max_age_hours=720.0,
            allowed_sources=("self_reported",),
            allowed_units=("frequency", "category", "status"),
            enum_values=("always", "sometimes", "never"),
        ),
        InputFieldSpec(
            field_code="standing_water_near_home",
            domain="health_input",
            required=True,
            max_age_hours=720.0,
            allowed_sources=("self_reported",),
            allowed_units=("boolean_flag", "category", "status"),
            enum_values=("yes", "no"),
        ),
    ),
    factor_evaluators=(
        ("rainfall", _eval_rainfall),
        ("temperature", _eval_temperature),
        ("bed_net_nightly_use", _eval_bed_net),
        ("standing_water_near_home", _eval_standing_water),
    ),
    level_thresholds=(
        LevelThresholdBand(
            level="low",
            min_points=0.0,
            max_points=1.0,
            summary_code="low_exposure_threshold_met",
        ),
        LevelThresholdBand(
            level="moderate",
            min_points=2.0,
            max_points=4.0,
            summary_code="moderate_exposure_threshold_met",
        ),
        LevelThresholdBand(
            level="high",
            min_points=5.0,
            max_points=None,
            summary_code="high_exposure_threshold_met",
        ),
    ),
    base_limitation=(
        "This is a preventive mosquito-exposure indicator based on regional weather context "
        "and self-reported habits, not a malaria diagnosis."
    ),
    provenance_limitation=(
        "Environmental rainfall and temperature reflect area-level observations rather than "
        "individual household measurements, combined with self-reported preventive practices."
    ),
    next_steps_by_level={
        "low": (
            NextStepTemplate(
                action_code="maintain_nightly_bed_net_and_vector_hygiene",
                priority="routine",
            ),
        ),
        "moderate": (
            NextStepTemplate(
                action_code="reinforce_mosquito_net_and_clear_standing_water",
                priority="standard",
            ),
        ),
        "high": (
            NextStepTemplate(
                action_code="reinforce_mosquito_net_and_clear_standing_water",
                priority="timely",
            ),
            NextStepTemplate(
                action_code="visit_facility_immediately_if_fever_develops",
                priority="timely",
                facility_service_tags=(
                    "primary_care",
                    "community_health_worker",
                    "malaria_testing",
                ),
            ),
        ),
    },
    factor_specific_next_steps={
        "no_insecticide_treated_net_use": NextStepTemplate(
            action_code="sleep_under_insecticide_treated_bed_net",
            priority="standard",
        ),
    },
    high_risk_facility_tags=("primary_care", "community_health_worker", "malaria_testing"),
)
