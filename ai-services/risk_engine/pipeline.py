"""Pure 8-step deterministic risk-assessment evaluation pipeline (RISK_SCORING.md §4-8)."""

from __future__ import annotations

from collections.abc import Collection
from typing import Final

from app.contracts.common import RiskLevel
from app.contracts.risk_assessment import (
    ContributingFactor,
    RecommendedNextStep,
    RiskAssessmentResult,
    RiskCalculationRequest,
    RiskCalculationResponse,
    RiskSafetyMetadata,
)
from app.safety.crisis_screener import CrisisScreeningResult, screen_combined_crisis
from app.safety.escalation_templates import (
    ACUTE_MEDICAL_EMERGENCY_MESSAGE,
    LOW_RISK_CAVEAT_STATEMENT,
    MENTAL_HEALTH_CRISIS_MESSAGE,
)
from app.safety.output_guard import detect_output_violations
from data_processing.validators import validate_snapshot_inputs

from risk_engine.registry import DEFAULT_RULE_REGISTRY, RuleRegistry
from risk_engine.spec import EvaluatedFactor, LevelThresholdBand, RuleSetSpec

_LEVEL_RANK: Final[dict[RiskLevel, int]] = {
    "low": 1,
    "moderate": 2,
    "high": 3,
}


def _screen_snapshot_for_crisis(request: RiskCalculationRequest) -> CrisisScreeningResult:
    signals: dict[str, int | float | str] = {}
    free_texts: list[str] = []

    for h_item in request.inputs.health_inputs:
        signals[h_item.field_code] = h_item.value
        if isinstance(h_item.value, str) and len(h_item.value) > 3:
            free_texts.append(h_item.value)

    for source_list in (request.inputs.check_in_responses, request.inputs.check_in_overlay):
        if source_list is not None:
            for c_item in source_list:
                signals[c_item.question_code] = c_item.value
                if isinstance(c_item.value, str) and len(c_item.value) > 3:
                    free_texts.append(c_item.value)

    return screen_combined_crisis(texts=free_texts, signals=signals)


def _resolve_threshold_band(
    total_points: float, bands: tuple[LevelThresholdBand, ...]
) -> LevelThresholdBand:
    for band in bands:
        if total_points >= band.min_points and (
            band.max_points is None or total_points <= band.max_points
        ):
            return band
    return bands[-1]


def evaluate_with_spec(
    request: RiskCalculationRequest,
    spec: RuleSetSpec,
) -> RiskCalculationResponse:
    """Execute Steps 2-8 purely against `(request, spec)` with zero wall-clock or I/O access."""
    # Step 2: Deterministic acute emergency & self-harm safety gate
    # First verify range bounds on rule inputs if any negative/invalid numbers were passed, EXCEPT
    # still catch genuine crisis signals immediately before normal scoring.
    crisis = _screen_snapshot_for_crisis(request)
    if crisis.escalation_required:
        escalation_note = (
            MENTAL_HEALTH_CRISIS_MESSAGE
            if crisis.escalation_category == "mental_health_crisis"
            else ACUTE_MEDICAL_EMERGENCY_MESSAGE
        )
        return RiskCalculationResponse(
            request_id=request.request_id,
            input_snapshot_id=request.input_snapshot_id,
            use_case_code=spec.use_case_code,
            rule_model_version=spec.rule_model_version,
            implementation_type=spec.implementation_type,
            status="limited",
            calculated_at=request.calculated_for_timestamp,
            result=RiskAssessmentResult(
                level=None,
                score_band_or_weight_summary="escalation_override_bypassed_scoring",
                contributing_factors=[],
                limitations=[spec.base_limitation, escalation_note],
                recommended_next_steps=[
                    RecommendedNextStep(
                        action_code="contact_emergency_and_crisis_support",
                        priority="urgent_escalation",
                        facility_service_tags=list(crisis.recommended_facility_tags),
                    )
                ],
            ),
            safety_metadata=RiskSafetyMetadata(
                non_diagnostic_verified=True,
                escalation_required=True,
                escalation_category=crisis.escalation_category,
                reason_codes=list(crisis.reason_codes),
                missing_or_stale_fields=[],
            ),
        )

    # Step 3: Completeness, physiological range, quality, and freshness check
    validated = validate_snapshot_inputs(request, spec.fields)
    if not validated.is_complete_for_scoring:
        missing_joined = ", ".join(validated.missing_or_stale_fields)
        degraded_limitation = (
            f"A current preventive indicator could not be calculated because required inputs "
            f"are missing, stale, or from an unavailable source: {missing_joined}. "
            f"Missing data never implies low risk."
        )
        return RiskCalculationResponse(
            request_id=request.request_id,
            input_snapshot_id=request.input_snapshot_id,
            use_case_code=spec.use_case_code,
            rule_model_version=spec.rule_model_version,
            implementation_type=spec.implementation_type,
            status="limited",
            calculated_at=request.calculated_for_timestamp,
            result=RiskAssessmentResult(
                level=None,
                score_band_or_weight_summary=None,
                contributing_factors=[],
                limitations=[spec.base_limitation, degraded_limitation],
                recommended_next_steps=[
                    RecommendedNextStep(
                        action_code="provide_fresh_required_inputs",
                        priority="standard",
                    )
                ],
            ),
            safety_metadata=RiskSafetyMetadata(
                non_diagnostic_verified=True,
                escalation_required=False,
                escalation_category=None,
                reason_codes=list(validated.reason_codes),
                missing_or_stale_fields=list(validated.missing_or_stale_fields),
            ),
        )

    # Step 4: Evaluate individual factor rules / weights
    scored_items: list[tuple[int, EvaluatedFactor, ContributingFactor]] = []
    total_points = 0.0
    highest_floor: RiskLevel | None = None

    for order_idx, (field_code, evaluator_fn) in enumerate(spec.factor_evaluators):
        norm_val = validated.fields.get(field_code)
        if norm_val is None:
            continue
        evaluated = evaluator_fn(norm_val)
        if evaluated is None:
            continue

        total_points += evaluated.points
        if evaluated.floor_level is not None and (
            highest_floor is None or _LEVEL_RANK[evaluated.floor_level] > _LEVEL_RANK[highest_floor]
        ):
            highest_floor = evaluated.floor_level

        contract_factor = ContributingFactor(
            factor_code=evaluated.factor_code,
            source_field=evaluated.source_field,
            observed_at=norm_val.observed_at,
            source_type=norm_val.source_type,
            direction=evaluated.direction,
            explanation_key=evaluated.explanation_key,
        )
        scored_items.append((order_idx, evaluated, contract_factor))

    # Step 5: Aggregate score, map to threshold band, and enforce floor guardrails
    band = _resolve_threshold_band(total_points, spec.level_thresholds)
    final_level = band.level
    summary_code = band.summary_code
    if highest_floor is not None and _LEVEL_RANK[highest_floor] > _LEVEL_RANK[final_level]:
        final_level = highest_floor
        summary_code = f"{highest_floor}_floor_guardrail_applied"
    elif highest_floor is not None and highest_floor == final_level:
        summary_code = f"{band.summary_code}_with_floor_guardrail"

    # Step 6: Deterministic ordering of contributing factors
    # Highest points first -> risk-increasing before protective -> declaration order -> factor_code
    scored_items.sort(
        key=lambda item: (
            -item[1].points,
            0 if item[1].direction == "increases_risk" else 1,
            item[0],
            item[1].factor_code,
        )
    )
    ordered_factors = [item[2] for item in scored_items]

    # Step 7: Attach mandatory base, HAZ-01 caveat, provenance, and optional-omitted limitations
    limitations: list[str] = [
        spec.base_limitation,
        LOW_RISK_CAVEAT_STATEMENT,
        spec.provenance_limitation,
    ]
    if validated.omitted_optional_fields:
        omitted_str = ", ".join(validated.omitted_optional_fields)
        limitations.append(
            f"Optional inputs were omitted or outside the freshness window and were not "
            f"evaluated: {omitted_str}."
        )

    # Step 8: Map level + active factors to approved non-prescriptive preventive next steps
    next_steps: list[RecommendedNextStep] = []
    seen_actions: set[str] = set()

    for template in spec.next_steps_by_level[final_level]:
        tags = list(template.facility_service_tags) if template.facility_service_tags else None
        next_steps.append(
            RecommendedNextStep(
                action_code=template.action_code,
                priority=template.priority,
                facility_service_tags=tags,
            )
        )
        seen_actions.add(template.action_code)

    for _, evaluated, _ in scored_items:
        specific = spec.factor_specific_next_steps.get(evaluated.factor_code)
        if specific is not None and specific.action_code not in seen_actions:
            tags = list(specific.facility_service_tags) if specific.facility_service_tags else None
            next_steps.append(
                RecommendedNextStep(
                    action_code=specific.action_code,
                    priority=specific.priority,
                    facility_service_tags=tags,
                )
            )
            seen_actions.add(specific.action_code)

    if final_level == "high" and not any(step.facility_service_tags for step in next_steps):
        next_steps.insert(
            0,
            RecommendedNextStep(
                action_code="consider_facility_or_provider_visit",
                priority="timely",
                facility_service_tags=list(spec.high_risk_facility_tags),
            ),
        )

    non_diag_clean = all(len(detect_output_violations(lim)) == 0 for lim in limitations)

    return RiskCalculationResponse(
        request_id=request.request_id,
        input_snapshot_id=request.input_snapshot_id,
        use_case_code=spec.use_case_code,
        rule_model_version=spec.rule_model_version,
        implementation_type=spec.implementation_type,
        status="complete",
        calculated_at=request.calculated_for_timestamp,
        result=RiskAssessmentResult(
            level=final_level,
            score_band_or_weight_summary=summary_code,
            contributing_factors=ordered_factors,
            limitations=limitations,
            recommended_next_steps=next_steps,
        ),
        safety_metadata=RiskSafetyMetadata(
            non_diagnostic_verified=non_diag_clean,
            escalation_required=False,
            escalation_category=None,
            reason_codes=list(validated.reason_codes),
            missing_or_stale_fields=[],
        ),
    )


def evaluate_risk_assessment(
    request: RiskCalculationRequest,
    *,
    enabled_versions: Collection[str],
    registry: RuleRegistry = DEFAULT_RULE_REGISTRY,
) -> RiskCalculationResponse:
    """Full 8-step deterministic risk engine entrypoint (Steps 1-8)."""
    # Step 1: Verify use_case_code:rule_model_version is registered and active
    spec = registry.resolve_enabled_spec(
        request.use_case_code,
        request.rule_model_version,
        enabled_versions=enabled_versions,
    )
    return evaluate_with_spec(request, spec)
