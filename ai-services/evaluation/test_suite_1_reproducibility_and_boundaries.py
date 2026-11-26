"""Suite 1: Deterministic reproducibility & boundary evaluation (AI_SAFETY.md §5 Suite 1)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.contracts.risk_assessment import (
    HealthInputItem,
    RiskAuthorizationContext,
    RiskCalculationRequest,
    RiskInputsPayload,
)
from data_processing.types import InputFieldSpec, NormalizedFieldValue
from risk_engine.pipeline import evaluate_risk_assessment, evaluate_with_spec
from risk_engine.spec import (
    EvaluatedFactor,
    LevelThresholdBand,
    NextStepTemplate,
    RuleSetSpec,
)

from evaluation.fixtures import (
    create_eval_client,
    internal_auth_headers,
    load_synthetic_json,
)

_CALC_TS = datetime(2026, 11, 20, 12, 0, 0, tzinfo=UTC)
_OBS_TS = datetime(2026, 11, 19, 8, 0, 0, tzinfo=UTC)


def _build_lifestyle_request(
    *,
    activity_min: int,
    tobacco: str,
    sleep_hours: float | None = None,
    fruit_veg_servings: int | None = None,
) -> RiskCalculationRequest:
    items: list[HealthInputItem] = [
        HealthInputItem(
            field_code="physical_activity_minutes_per_week",
            value=activity_min,
            unit="min/week",
            observed_at=_OBS_TS,
            source_type="self_reported",
        ),
        HealthInputItem(
            field_code="tobacco_use_status",
            value=tobacco,
            unit=None,
            observed_at=_OBS_TS,
            source_type="self_reported",
        ),
    ]
    if sleep_hours is not None:
        items.append(
            HealthInputItem(
                field_code="sleep_hours_avg",
                value=sleep_hours,
                unit="hours/day",
                observed_at=_OBS_TS,
                source_type="self_reported",
            )
        )
    if fruit_veg_servings is not None:
        items.append(
            HealthInputItem(
                field_code="diet_fruit_veg_servings_per_day",
                value=fruit_veg_servings,
                unit="servings/day",
                observed_at=_OBS_TS,
                source_type="self_reported",
            )
        )
    return RiskCalculationRequest(
        request_id="req-suite1-boundary",
        use_case_code="lifestyle_ncd_preventive",
        rule_model_version="rules-v1.0.0",
        input_snapshot_id="snap-suite1-001",
        calculated_for_timestamp=_CALC_TS,
        authorization_context=RiskAuthorizationContext(
            consent_verified=True,
            consent_purpose_code="preventive_risk_calculation",
            consent_version="v1",
        ),
        inputs=RiskInputsPayload(health_inputs=items),
    )


def test_suite1_golden_synthetic_dataset_matches_100_percent() -> None:
    dataset = load_synthetic_json("lifestyle_ncd_golden_cases.json")
    raw_cases = dataset["cases"]
    assert isinstance(raw_cases, list)
    assert len(raw_cases) >= 6

    client = create_eval_client()
    for case in raw_cases:
        assert isinstance(case, dict)
        payload = {
            "request_id": f"req-{case['case_id']}",
            "use_case_code": dataset["use_case_code"],
            "rule_model_version": dataset["rule_model_version"],
            "input_snapshot_id": f"snap-{case['case_id']}",
            "calculated_for_timestamp": dataset["calculated_for_timestamp"],
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "preventive_risk_calculation",
                "consent_version": "v1",
            },
            "inputs": {
                "health_inputs": case["health_inputs"],
                "environmental_observations": [],
            },
        }
        resp = client.post(
            "/internal/v1/risk-assessments/calculate",
            json=payload,
            headers=internal_auth_headers(str(payload["request_id"])),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == case["expected_status"]
        assert body["result"]["level"] == case["expected_level"]
        actual_factors = [f["factor_code"] for f in body["result"]["contributing_factors"]]
        assert actual_factors == case["expected_factor_codes"]


@pytest.mark.parametrize(
    ("activity_min", "tobacco", "sleep_hours", "servings", "expected_level"),
    [
        # 0 points -> low
        (150, "never", 6.0, 5, "low"),
        (300, "never", 10.0, 2, "low"),
        # 1 point -> low (upper low cutoff)
        (149, "never", 8.0, 5, "low"),
        (75, "never", 8.0, 5, "low"),
        (150, "former", 8.0, 5, "low"),
        (150, "never", 5.9, 5, "low"),
        (150, "never", 10.1, 5, "low"),
        (150, "never", 8.0, 1, "low"),
        # 2 points -> moderate (lower moderate cutoff)
        (74, "never", 8.0, 5, "moderate"),
        (149, "former", 8.0, 5, "moderate"),
        (150, "former", 5.5, 3, "moderate"),
        # 3 points -> moderate (upper moderate cutoff)
        (74, "former", 8.0, 5, "moderate"),
        (150, "current", 8.0, 5, "moderate"),
        (74, "never", 5.0, 4, "moderate"),
        # >= 4 points -> high (lower high cutoff and above)
        (149, "current", 8.0, 5, "high"),
        (74, "current", 8.0, 5, "high"),
        (74, "former", 5.0, 1, "high"),
        (0, "current", 4.0, 0, "high"),
    ],
)
def test_suite1_threshold_cutoffs_matrix(
    activity_min: int,
    tobacco: str,
    sleep_hours: float,
    servings: int,
    expected_level: str,
) -> None:
    req = _build_lifestyle_request(
        activity_min=activity_min,
        tobacco=tobacco,
        sleep_hours=sleep_hours,
        fruit_veg_servings=servings,
    )
    out = evaluate_risk_assessment(
        req,
        enabled_versions={"lifestyle_ncd_preventive:rules-v1.0.0"},
    )
    assert out.status == "complete"
    assert out.result.level == expected_level


@pytest.mark.parametrize("neutral_servings", [2, 3, 4])
def test_suite1_fruit_veg_neutral_band_emits_zero_points_and_no_factor(
    neutral_servings: int,
) -> None:
    req = _build_lifestyle_request(
        activity_min=180,
        tobacco="never",
        sleep_hours=7.5,
        fruit_veg_servings=neutral_servings,
    )
    out = evaluate_risk_assessment(
        req,
        enabled_versions={"lifestyle_ncd_preventive:rules-v1.0.0"},
    )
    assert out.status == "complete"
    assert out.result.level == "low"
    factor_codes = [f.factor_code for f in out.result.contributing_factors]
    assert "fruit_veg_intake_low" not in factor_codes
    assert "fruit_veg_intake_adequate" not in factor_codes
    assert all(
        f.source_field != "diet_fruit_veg_servings_per_day" for f in out.result.contributing_factors
    )


def test_suite1_current_tobacco_floor_guardrail_and_pipeline_floor_promotion() -> None:
    # 1. On lifestyle_ncd_preventive: 0 activity points + current tobacco (+3 + floor=moderate) -> moderate
    req_mod = _build_lifestyle_request(
        activity_min=240, tobacco="current", sleep_hours=8.0, fruit_veg_servings=6
    )
    res_mod = evaluate_risk_assessment(
        req_mod,
        enabled_versions={"lifestyle_ncd_preventive:rules-v1.0.0"},
    )
    assert res_mod.result.level == "moderate"
    assert (
        res_mod.result.score_band_or_weight_summary == "moderate_threshold_met_with_floor_guardrail"
    )

    # 1 activity point + current tobacco (+3) = 4 points -> high (floor does not cap high!)
    req_high = _build_lifestyle_request(
        activity_min=100, tobacco="current", sleep_hours=8.0, fruit_veg_servings=6
    )
    res_high = evaluate_risk_assessment(
        req_high,
        enabled_versions={"lifestyle_ncd_preventive:rules-v1.0.0"},
    )
    assert res_high.result.level == "high"

    # 2. Direct pipeline verification that a 0-point factor with floor_level="moderate" promotes low -> moderate
    def _zero_point_floor_eval(item: NormalizedFieldValue) -> EvaluatedFactor:
        return EvaluatedFactor(
            factor_code="floor_trigger_factor",
            source_field=item.field_code,
            points=0.0,
            direction="increases_risk",
            explanation_key="factor.floor.test",
            floor_level="moderate",
        )

    synthetic_spec = RuleSetSpec(
        use_case_code="lifestyle_ncd_preventive",
        rule_model_version="rules-v1.0.0-floor-check",
        name="Synthetic floor guardrail check",
        implementation_type="weighted_score",
        approval_status="draft",
        guideline_references=("Synthetic guideline",),
        intended_use="Test floor guardrail",
        excluded_use="Never clinical",
        fields=(
            InputFieldSpec(
                field_code="tobacco_use_status",
                domain="health_input",
                required=True,
                max_age_hours=720.0,
                enum_values=("never", "former", "current"),
            ),
        ),
        factor_evaluators=(("tobacco_use_status", _zero_point_floor_eval),),
        level_thresholds=(
            LevelThresholdBand(
                level="low", min_points=0.0, max_points=1.0, summary_code="low_band"
            ),
            LevelThresholdBand(
                level="moderate", min_points=2.0, max_points=3.0, summary_code="mod_band"
            ),
            LevelThresholdBand(
                level="high", min_points=4.0, max_points=None, summary_code="high_band"
            ),
        ),
        base_limitation="This is a preventive indicator, not a medical diagnosis.",
        provenance_limitation="Self-reported synthetic test.",
        next_steps_by_level={
            "low": (NextStepTemplate(action_code="routine_step", priority="routine"),),
            "moderate": (NextStepTemplate(action_code="mod_step", priority="standard"),),
            "high": (NextStepTemplate(action_code="high_step", priority="timely"),),
        },
        factor_specific_next_steps={},
        high_risk_facility_tags=("primary_care",),
    )
    promoted = evaluate_with_spec(req_mod, synthetic_spec)
    assert promoted.result.level == "moderate"
    assert promoted.result.score_band_or_weight_summary == "moderate_floor_guardrail_applied"


def test_suite1_100_run_byte_identical_determinism_across_wall_clock_shifts() -> None:
    client = create_eval_client()
    req = _build_lifestyle_request(
        activity_min=50,
        tobacco="former",
        sleep_hours=5.5,
        fruit_veg_servings=6,
    )
    payload_dict = req.model_dump(mode="json")

    baseline_bytes: bytes | None = None
    for iteration in range(100):
        # Reverse health_inputs order on odd iterations to prove snapshot array order independence too
        mutated_payload = dict(payload_dict)
        raw_inputs = dict(req.inputs.model_dump(mode="json"))
        health_list = list(raw_inputs["health_inputs"])
        if iteration % 2 == 1:
            health_list.reverse()
        raw_inputs["health_inputs"] = health_list
        mutated_payload["inputs"] = raw_inputs

        resp = client.post(
            "/internal/v1/risk-assessments/calculate",
            json=mutated_payload,
            headers=internal_auth_headers("req-suite1-determinism"),
        )
        assert resp.status_code == 200
        if baseline_bytes is None:
            baseline_bytes = resp.content
        else:
            assert resp.content == baseline_bytes

    # Also verify shifting calculated_for_timestamp + observed_at together by +365 days yields identical factors/level
    shifted_req = RiskCalculationRequest(
        request_id=req.request_id,
        use_case_code=req.use_case_code,
        rule_model_version=req.rule_model_version,
        input_snapshot_id=req.input_snapshot_id,
        calculated_for_timestamp=_CALC_TS + timedelta(days=365),
        authorization_context=req.authorization_context,
        inputs=RiskInputsPayload(
            health_inputs=[
                HealthInputItem(
                    field_code=item.field_code,
                    value=item.value,
                    unit=item.unit,
                    observed_at=item.observed_at + timedelta(days=365),
                    source_type=item.source_type,
                )
                for item in req.inputs.health_inputs
            ]
        ),
    )
    out_orig = evaluate_risk_assessment(
        req, enabled_versions={"lifestyle_ncd_preventive:rules-v1.0.0"}
    )
    out_shift = evaluate_risk_assessment(
        shifted_req, enabled_versions={"lifestyle_ncd_preventive:rules-v1.0.0"}
    )
    assert out_orig.result.level == out_shift.result.level
    assert [f.factor_code for f in out_orig.result.contributing_factors] == [
        f.factor_code for f in out_shift.result.contributing_factors
    ]
