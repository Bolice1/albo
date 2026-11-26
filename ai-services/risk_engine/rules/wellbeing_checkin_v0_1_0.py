"""Draft rule specification: wellbeing_checkin_screener — rules-v0.1.0-draft."""

from __future__ import annotations

from typing import Final

from data_processing.types import InputFieldSpec, NormalizedFieldValue

from risk_engine.spec import (
    EvaluatedFactor,
    LevelThresholdBand,
    NextStepTemplate,
    RuleSetSpec,
)


def _eval_stress_frequency(item: NormalizedFieldValue) -> EvaluatedFactor:
    score = int(item.value)
    if score >= 3:
        return EvaluatedFactor(
            factor_code="elevated_stress_frequency",
            source_field=item.field_code,
            points=2.0,
            direction="increases_risk",
            explanation_key="factor.wellbeing.stress_elevated",
        )
    if score == 2:
        return EvaluatedFactor(
            factor_code="moderate_stress_frequency",
            source_field=item.field_code,
            points=1.0,
            direction="increases_risk",
            explanation_key="factor.wellbeing.stress_moderate",
        )
    return EvaluatedFactor(
        factor_code="low_stress_frequency",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.wellbeing.stress_low",
    )


def _eval_exhaustion(item: NormalizedFieldValue) -> EvaluatedFactor:
    score = int(item.value)
    if score >= 3:
        return EvaluatedFactor(
            factor_code="elevated_emotional_exhaustion",
            source_field=item.field_code,
            points=2.0,
            direction="increases_risk",
            explanation_key="factor.wellbeing.exhaustion_elevated",
        )
    if score == 2:
        return EvaluatedFactor(
            factor_code="moderate_emotional_exhaustion",
            source_field=item.field_code,
            points=1.0,
            direction="increases_risk",
            explanation_key="factor.wellbeing.exhaustion_moderate",
        )
    return EvaluatedFactor(
        factor_code="low_emotional_exhaustion",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.wellbeing.exhaustion_low",
    )


def _eval_sleep_quality(item: NormalizedFieldValue) -> EvaluatedFactor:
    # 0..1 = restful sleep, 2 = moderate disruption, 3..4 = frequent sleep disruption
    score = int(item.value)
    if score >= 3:
        return EvaluatedFactor(
            factor_code="frequent_sleep_disruption",
            source_field=item.field_code,
            points=2.0,
            direction="increases_risk",
            explanation_key="factor.wellbeing.sleep_disrupted",
        )
    if score == 2:
        return EvaluatedFactor(
            factor_code="moderate_sleep_disruption",
            source_field=item.field_code,
            points=1.0,
            direction="increases_risk",
            explanation_key="factor.wellbeing.sleep_moderate",
        )
    return EvaluatedFactor(
        factor_code="restful_sleep_pattern",
        source_field=item.field_code,
        points=0.0,
        direction="protective",
        explanation_key="factor.wellbeing.sleep_restful",
    )


def _eval_self_harm_zero(item: NormalizedFieldValue) -> EvaluatedFactor | None:
    # Non-zero self_harm_signal is intercepted by Step 2 crisis override before factor scoring.
    _ = item
    return None


WELLBEING_CHECKIN_V0_1_0_SPEC: Final[RuleSetSpec] = RuleSetSpec(
    use_case_code="wellbeing_checkin_screener",
    rule_model_version="rules-v0.1.0-draft",
    name="Structured wellbeing and stress-pattern preventive screener",
    implementation_type="rule",
    approval_status="draft",
    guideline_references=(
        "WHO Preventive Stress Management Guidance",
        "Rwanda Biomedical Centre (RBC) Community Mental Wellbeing Preventive Guidance",
    ),
    intended_use=(
        "Help adult citizens reflect on recent stress, exhaustion, and sleep disruption "
        "patterns with immediate crisis override on any self-harm signal."
    ),
    excluded_use=(
        "Not a psychiatric diagnosis of depression, anxiety, or burnout, and never a "
        "substitute for crisis counseling or professional mental-health care."
    ),
    fields=(
        InputFieldSpec(
            field_code="stress_frequency_score",
            domain="check_in_response",
            required=True,
            max_age_hours=336.0,
            allowed_sources=("self_reported",),
            allowed_units=("score",),
            min_value=0.0,
            max_value=4.0,
            integer_only=True,
        ),
        InputFieldSpec(
            field_code="exhaustion_score",
            domain="check_in_response",
            required=True,
            max_age_hours=336.0,
            allowed_sources=("self_reported",),
            allowed_units=("score",),
            min_value=0.0,
            max_value=4.0,
            integer_only=True,
        ),
        InputFieldSpec(
            field_code="sleep_quality_score",
            domain="check_in_response",
            required=True,
            max_age_hours=336.0,
            allowed_sources=("self_reported",),
            allowed_units=("score",),
            min_value=0.0,
            max_value=4.0,
            integer_only=True,
        ),
        InputFieldSpec(
            field_code="self_harm_signal",
            domain="check_in_response",
            required=False,
            max_age_hours=336.0,
            allowed_sources=("self_reported",),
            allowed_units=("score", "flag"),
            min_value=0.0,
            max_value=4.0,
            integer_only=True,
        ),
    ),
    factor_evaluators=(
        ("stress_frequency_score", _eval_stress_frequency),
        ("exhaustion_score", _eval_exhaustion),
        ("sleep_quality_score", _eval_sleep_quality),
        ("self_harm_signal", _eval_self_harm_zero),
    ),
    level_thresholds=(
        LevelThresholdBand(
            level="low",
            min_points=0.0,
            max_points=1.0,
            summary_code="low_stress_pattern_rule_met",
        ),
        LevelThresholdBand(
            level="moderate",
            min_points=2.0,
            max_points=3.0,
            summary_code="moderate_stress_pattern_rule_met",
        ),
        LevelThresholdBand(
            level="high",
            min_points=4.0,
            max_points=None,
            summary_code="high_stress_pattern_rule_met",
        ),
    ),
    base_limitation=(
        "This is a preventive wellbeing reflection indicator based on self-reported check-in "
        "responses, not a clinical mental-health diagnosis."
    ),
    provenance_limitation=(
        "Responses reflect self-reported perceptions over the recent check-in window and do "
        "not replace an evaluation by a qualified healthcare or mental-health professional."
    ),
    next_steps_by_level={
        "low": (
            NextStepTemplate(
                action_code="maintain_rest_and_supportive_daily_routines",
                priority="routine",
            ),
        ),
        "moderate": (
            NextStepTemplate(
                action_code="practice_rest_recovery_and_check_in_regularly",
                priority="standard",
            ),
        ),
        "high": (
            NextStepTemplate(
                action_code="consider_speaking_with_qualified_wellbeing_provider",
                priority="timely",
                facility_service_tags=("mental_health_support", "primary_care"),
            ),
            NextStepTemplate(
                action_code="practice_rest_recovery_and_check_in_regularly",
                priority="standard",
            ),
        ),
    },
    factor_specific_next_steps={
        "frequent_sleep_disruption": NextStepTemplate(
            action_code="review_sleep_routine_guidance",
            priority="standard",
        ),
    },
    high_risk_facility_tags=("mental_health_support", "primary_care"),
)
