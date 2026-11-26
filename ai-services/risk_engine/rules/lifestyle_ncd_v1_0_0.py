"""Rule specification: lifestyle_ncd_preventive — rules-v1.0.0 (MODEL_DOCUMENTATION.md §6.1)."""

from __future__ import annotations

from typing import Final

from data_processing.types import InputFieldSpec, NormalizedFieldValue

from risk_engine.spec import (
    EvaluatedFactor,
    LevelThresholdBand,
    NextStepTemplate,
    RuleSetSpec,
)


def _eval_physical_activity(item: NormalizedFieldValue) -> EvaluatedFactor:
    minutes = int(item.value)
    if minutes < 75:
        return EvaluatedFactor(
            factor_code="physical_activity_very_low",
            source_field=item.field_code,
            points=2.0,
            direction="increases_risk",
            explanation_key="factor.physical_activity.very_low",
        )
    if minutes < 150:
        return EvaluatedFactor(
            factor_code="physical_activity_below_guideline",
            source_field=item.field_code,
            points=1.0,
            direction="increases_risk",
            explanation_key="factor.physical_activity.below_guideline",
        )
    return EvaluatedFactor(
        factor_code="physical_activity_meets_guideline",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.physical_activity.meets_guideline",
    )


def _eval_tobacco_use(item: NormalizedFieldValue) -> EvaluatedFactor:
    status = str(item.value)
    if status == "current":
        return EvaluatedFactor(
            factor_code="current_tobacco_use",
            source_field=item.field_code,
            points=3.0,
            direction="increases_risk",
            explanation_key="factor.tobacco.current",
            floor_level="moderate",
        )
    if status == "former":
        return EvaluatedFactor(
            factor_code="former_tobacco_use",
            source_field=item.field_code,
            points=1.0,
            direction="increases_risk",
            explanation_key="factor.tobacco.former",
        )
    return EvaluatedFactor(
        factor_code="no_tobacco_use",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.tobacco.never",
    )


def _eval_sleep_hours(item: NormalizedFieldValue) -> EvaluatedFactor:
    hours = float(item.value)
    if hours < 6.0 or hours > 10.0:
        return EvaluatedFactor(
            factor_code="sleep_duration_outside_recommended_range",
            source_field=item.field_code,
            points=1.0,
            direction="increases_risk",
            explanation_key="factor.sleep.outside_range",
        )
    return EvaluatedFactor(
        factor_code="sleep_duration_adequate",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.sleep.adequate",
    )


def _eval_fruit_veg(item: NormalizedFieldValue) -> EvaluatedFactor | None:
    servings = int(item.value)
    if servings < 2:
        return EvaluatedFactor(
            factor_code="fruit_veg_intake_low",
            source_field=item.field_code,
            points=1.0,
            direction="increases_risk",
            explanation_key="factor.diet.fruit_veg_low",
        )
    if servings <= 4:
        # Per MODEL_DOCUMENTATION.md §6.1: 2..4 servings/day adds +0 points and emits no factor
        return None
    return EvaluatedFactor(
        factor_code="fruit_veg_intake_adequate",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.diet.fruit_veg_adequate",
    )


LIFESTYLE_NCD_V1_0_0_SPEC: Final[RuleSetSpec] = RuleSetSpec(
    use_case_code="lifestyle_ncd_preventive",
    rule_model_version="rules-v1.0.0",
    name="Preventive lifestyle and NCD risk-factor awareness indicator",
    implementation_type="weighted_score",
    approval_status="under_review",
    guideline_references=(
        "WHO Guidelines on Physical Activity and Sedentary Behaviour (2020)",
        "WHO Tobacco Prevention Guidance",
        "Rwanda Biomedical Centre (RBC) NCD Preventive Lifestyle Guidance",
    ),
    intended_use=(
        "Summarize self-reported modifiable lifestyle factors associated with NCD prevention "
        "into a non-diagnostic preventive indicator for adult citizens (18+) in Rwanda."
    ),
    excluded_use=(
        "Not a medical diagnosis of cardiovascular disease, diabetes, cancer, or chronic "
        "respiratory disease; never used to prescribe medication or deny care."
    ),
    fields=(
        InputFieldSpec(
            field_code="physical_activity_minutes_per_week",
            domain="health_input",
            required=True,
            max_age_hours=720.0,
            allowed_sources=("self_reported",),
            allowed_units=("min/week",),
            min_value=0.0,
            max_value=5040.0,
            integer_only=True,
        ),
        InputFieldSpec(
            field_code="tobacco_use_status",
            domain="health_input",
            required=True,
            max_age_hours=720.0,
            allowed_sources=("self_reported",),
            allowed_units=("status", "category"),
            enum_values=("never", "former", "current"),
        ),
        InputFieldSpec(
            field_code="sleep_hours_avg",
            domain="health_input",
            required=False,
            max_age_hours=720.0,
            allowed_sources=("self_reported",),
            allowed_units=("hours/day", "h/day"),
            min_value=0.0,
            max_value=24.0,
            integer_only=False,
        ),
        InputFieldSpec(
            field_code="diet_fruit_veg_servings_per_day",
            domain="health_input",
            required=False,
            max_age_hours=720.0,
            allowed_sources=("self_reported",),
            allowed_units=("servings/day",),
            min_value=0.0,
            max_value=20.0,
            integer_only=True,
        ),
    ),
    factor_evaluators=(
        ("physical_activity_minutes_per_week", _eval_physical_activity),
        ("tobacco_use_status", _eval_tobacco_use),
        ("sleep_hours_avg", _eval_sleep_hours),
        ("diet_fruit_veg_servings_per_day", _eval_fruit_veg),
    ),
    level_thresholds=(
        LevelThresholdBand(
            level="low",
            min_points=0.0,
            max_points=1.0,
            summary_code="low_threshold_met",
        ),
        LevelThresholdBand(
            level="moderate",
            min_points=2.0,
            max_points=3.0,
            summary_code="moderate_threshold_met",
        ),
        LevelThresholdBand(
            level="high",
            min_points=4.0,
            max_points=None,
            summary_code="high_threshold_met",
        ),
    ),
    base_limitation=(
        "This is a preventive risk indicator based on self-reported lifestyle information, "
        "not a medical diagnosis."
    ),
    provenance_limitation=(
        "Inputs were self-reported by the citizen and were not independently verified by a "
        "clinical measurement."
    ),
    next_steps_by_level={
        "low": (
            NextStepTemplate(
                action_code="maintain_preventive_lifestyle_habits",
                priority="routine",
            ),
        ),
        "moderate": (
            NextStepTemplate(
                action_code="review_preventive_lifestyle_guidance",
                priority="standard",
            ),
        ),
        "high": (
            NextStepTemplate(
                action_code="consider_preventive_health_checkup",
                priority="timely",
                facility_service_tags=("primary_care", "ncd_preventive_screening"),
            ),
            NextStepTemplate(
                action_code="review_preventive_lifestyle_guidance",
                priority="standard",
            ),
        ),
    },
    factor_specific_next_steps={
        "current_tobacco_use": NextStepTemplate(
            action_code="explore_tobacco_cessation_support",
            priority="standard",
        ),
        "physical_activity_very_low": NextStepTemplate(
            action_code="build_gradual_weekly_movement_routine",
            priority="standard",
        ),
    },
    high_risk_facility_tags=("primary_care", "ncd_preventive_screening"),
)
