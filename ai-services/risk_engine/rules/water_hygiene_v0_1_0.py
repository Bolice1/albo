"""Draft rule specification: water_hygiene_preventive — rules-v0.1.0-draft."""

from __future__ import annotations

from typing import Final

from data_processing.types import InputFieldSpec, NormalizedFieldValue

from risk_engine.spec import (
    EvaluatedFactor,
    LevelThresholdBand,
    NextStepTemplate,
    RuleSetSpec,
)


def _eval_water_rainfall(item: NormalizedFieldValue) -> EvaluatedFactor:
    mm = float(item.value)
    if mm >= 50.0:
        return EvaluatedFactor(
            factor_code="heavy_rainfall_runoff_context",
            source_field=item.field_code,
            points=2.0,
            direction="increases_risk",
            explanation_key="factor.water_rainfall.heavy",
        )
    if mm >= 20.0:
        return EvaluatedFactor(
            factor_code="moderate_rainfall_runoff_context",
            source_field=item.field_code,
            points=1.0,
            direction="increases_risk",
            explanation_key="factor.water_rainfall.moderate",
        )
    return EvaluatedFactor(
        factor_code="low_rainfall_runoff_context",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.water_rainfall.low",
    )


def _eval_water_treatment(item: NormalizedFieldValue) -> EvaluatedFactor:
    treatment = str(item.value)
    if treatment == "untreated":
        return EvaluatedFactor(
            factor_code="untreated_drinking_water",
            source_field=item.field_code,
            points=3.0,
            direction="increases_risk",
            explanation_key="factor.water.untreated",
            floor_level="moderate",
        )
    if treatment == "packaged":
        return EvaluatedFactor(
            factor_code="packaged_safe_drinking_water",
            source_field=item.field_code,
            points=0.0,
            direction="protective",
            explanation_key="factor.water.packaged",
        )
    return EvaluatedFactor(
        factor_code="boiled_or_filtered_drinking_water",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.water.boiled_or_filtered",
    )


def _eval_handwashing(item: NormalizedFieldValue) -> EvaluatedFactor:
    freq = str(item.value)
    if freq == "inconsistent":
        return EvaluatedFactor(
            factor_code="inconsistent_handwashing_with_soap",
            source_field=item.field_code,
            points=2.0,
            direction="increases_risk",
            explanation_key="factor.handwashing.inconsistent",
        )
    return EvaluatedFactor(
        factor_code="consistent_handwashing_with_soap",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.handwashing.consistent",
    )


WATER_HYGIENE_V0_1_0_SPEC: Final[RuleSetSpec] = RuleSetSpec(
    use_case_code="water_hygiene_preventive",
    rule_model_version="rules-v0.1.0-draft",
    name="Preventive water safety and hygiene exposure indicator",
    implementation_type="rule",
    approval_status="draft",
    guideline_references=(
        "WHO Guidelines for Drinking-water Quality and Household Water Treatment",
        "Rwanda Biomedical Centre (RBC) Water, Sanitation, and Hygiene (WASH) Guidance",
    ),
    intended_use=(
        "Support preventive safe-water and hand-hygiene awareness during routine and heavy "
        "rainfall conditions."
    ),
    excluded_use=(
        "Not a diagnosis of cholera, typhoid, or diarrheal illness; never replaces urgent "
        "oral rehydration and clinical evaluation when symptoms are present."
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
            field_code="drinking_water_treatment",
            domain="health_input",
            required=True,
            max_age_hours=720.0,
            allowed_sources=("self_reported",),
            allowed_units=("category", "status"),
            enum_values=("boiled_or_filtered", "packaged", "untreated"),
        ),
        InputFieldSpec(
            field_code="handwashing_with_soap_frequency",
            domain="health_input",
            required=True,
            max_age_hours=720.0,
            allowed_sources=("self_reported",),
            allowed_units=("frequency", "category", "status"),
            enum_values=("consistent", "inconsistent"),
        ),
    ),
    factor_evaluators=(
        ("rainfall", _eval_water_rainfall),
        ("drinking_water_treatment", _eval_water_treatment),
        ("handwashing_with_soap_frequency", _eval_handwashing),
    ),
    level_thresholds=(
        LevelThresholdBand(
            level="low",
            min_points=0.0,
            max_points=1.0,
            summary_code="low_wash_exposure_rule_met",
        ),
        LevelThresholdBand(
            level="moderate",
            min_points=2.0,
            max_points=3.0,
            summary_code="moderate_wash_exposure_rule_met",
        ),
        LevelThresholdBand(
            level="high",
            min_points=4.0,
            max_points=None,
            summary_code="high_wash_exposure_rule_met",
        ),
    ),
    base_limitation=(
        "This is a preventive water and hygiene exposure indicator based on regional rainfall "
        "context and self-reported WASH practices, not a clinical diagnosis."
    ),
    provenance_limitation=(
        "Rainfall context comes from area-level meteorological observations and does not test "
        "local tap or well water microbiological quality."
    ),
    next_steps_by_level={
        "low": (
            NextStepTemplate(
                action_code="maintain_safe_drinking_water_and_handwashing",
                priority="routine",
            ),
        ),
        "moderate": (
            NextStepTemplate(
                action_code="boil_or_filter_drinking_water_and_wash_hands_with_soap",
                priority="standard",
            ),
        ),
        "high": (
            NextStepTemplate(
                action_code="boil_or_filter_drinking_water_and_wash_hands_with_soap",
                priority="timely",
            ),
            NextStepTemplate(
                action_code="seek_prompt_care_if_dehydration_or_diarrhea_occurs",
                priority="timely",
                facility_service_tags=("primary_care", "community_health_worker"),
            ),
        ),
    },
    factor_specific_next_steps={
        "untreated_drinking_water": NextStepTemplate(
            action_code="use_boiled_filtered_or_verified_safe_water",
            priority="standard",
        ),
    },
    high_risk_facility_tags=("primary_care", "community_health_worker"),
)
