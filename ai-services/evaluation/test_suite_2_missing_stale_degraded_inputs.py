"""Suite 2: Missing, stale, and degraded input evaluation (AI_SAFETY.md §5 Suite 2, HAZ-01)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from evaluation.fixtures import (
    ALL_RULE_VERSION_KEYS,
    create_eval_client,
    internal_auth_headers,
)

_CALC_TS = datetime(2026, 11, 25, 12, 0, 0, tzinfo=UTC)
_FRESH_TS = "2026-11-24T12:00:00Z"


def _post_calc(
    payload_overrides: dict[str, object],
    *,
    enable_all_rules: bool = False,
) -> tuple[int, dict[str, object]]:
    client = create_eval_client(
        enabled_rule_versions=list(ALL_RULE_VERSION_KEYS) if enable_all_rules else None
    )
    base: dict[str, object] = {
        "request_id": "req-suite2-001",
        "use_case_code": "lifestyle_ncd_preventive",
        "rule_model_version": "rules-v1.0.0",
        "input_snapshot_id": "snap-suite2-001",
        "calculated_for_timestamp": _CALC_TS.isoformat().replace("+00:00", "Z"),
        "authorization_context": {
            "consent_verified": True,
            "consent_purpose_code": "preventive_risk_calculation",
            "consent_version": "v1",
        },
        "inputs": {
            "health_inputs": [],
            "environmental_observations": [],
        },
    }
    base.update(payload_overrides)
    resp = client.post(
        "/internal/v1/risk-assessments/calculate",
        json=base,
        headers=internal_auth_headers("req-suite2-001"),
    )
    body: dict[str, object] = resp.json()
    return resp.status_code, body


@pytest.mark.parametrize(
    ("health_inputs", "expected_missing_fields"),
    [
        (
            [],
            ["physical_activity_minutes_per_week", "tobacco_use_status"],
        ),
        (
            [
                {
                    "field_code": "physical_activity_minutes_per_week",
                    "value": 200,
                    "unit": "min/week",
                    "observed_at": _FRESH_TS,
                }
            ],
            ["tobacco_use_status"],
        ),
        (
            [
                {
                    "field_code": "tobacco_use_status",
                    "value": "never",
                    "unit": None,
                    "observed_at": _FRESH_TS,
                }
            ],
            ["physical_activity_minutes_per_week"],
        ),
    ],
)
def test_suite2_missing_required_fields_return_limited_and_null_level(
    health_inputs: list[dict[str, object]],
    expected_missing_fields: list[str],
) -> None:
    status_code, body = _post_calc(
        {"inputs": {"health_inputs": health_inputs, "environmental_observations": []}}
    )
    assert status_code == 200
    assert body["status"] == "limited"
    result = body["result"]
    assert isinstance(result, dict)
    assert result["level"] is None
    assert result["level"] != "low"
    meta = body["safety_metadata"]
    assert isinstance(meta, dict)
    assert meta["missing_or_stale_fields"] == expected_missing_fields
    assert "MISSING_REQUIRED_INPUT" in meta["reason_codes"]


@pytest.mark.parametrize("age_hours", [720.1, 721.0, 1440.0])
def test_suite2_stale_required_inputs_over_720h_return_limited_and_null_level(
    age_hours: float,
) -> None:
    stale_ts = (_CALC_TS - timedelta(hours=age_hours)).isoformat().replace("+00:00", "Z")
    status_code, body = _post_calc(
        {
            "inputs": {
                "health_inputs": [
                    {
                        "field_code": "physical_activity_minutes_per_week",
                        "value": 240,
                        "unit": "min/week",
                        "observed_at": stale_ts,
                    },
                    {
                        "field_code": "tobacco_use_status",
                        "value": "never",
                        "unit": None,
                        "observed_at": _FRESH_TS,
                    },
                ],
                "environmental_observations": [],
            }
        }
    )
    assert status_code == 200
    assert body["status"] == "limited"
    result = body["result"]
    assert isinstance(result, dict)
    assert result["level"] is None
    meta = body["safety_metadata"]
    assert isinstance(meta, dict)
    assert "physical_activity_minutes_per_week" in meta["missing_or_stale_fields"]
    assert "STALE_REQUIRED_INPUT" in meta["reason_codes"]


def test_suite2_exact_720h_freshness_boundary_is_accepted() -> None:
    boundary_ts = (_CALC_TS - timedelta(hours=720.0)).isoformat().replace("+00:00", "Z")
    status_code, body = _post_calc(
        {
            "inputs": {
                "health_inputs": [
                    {
                        "field_code": "physical_activity_minutes_per_week",
                        "value": 240,
                        "unit": "min/week",
                        "observed_at": boundary_ts,
                    },
                    {
                        "field_code": "tobacco_use_status",
                        "value": "never",
                        "unit": None,
                        "observed_at": boundary_ts,
                    },
                ],
                "environmental_observations": [],
            }
        }
    )
    assert status_code == 200
    assert body["status"] == "complete"


@pytest.mark.parametrize("bad_quality", ["unverified", "failed", "stale"])
def test_suite2_unverified_or_failed_environmental_observations_degrade_to_limited(
    bad_quality: str,
) -> None:
    status_code, body = _post_calc(
        {
            "use_case_code": "malaria_exposure_preventive",
            "rule_model_version": "rules-v0.1.0-draft",
            "inputs": {
                "health_inputs": [
                    {
                        "field_code": "bed_net_nightly_use",
                        "value": "always",
                        "unit": "frequency",
                        "observed_at": _FRESH_TS,
                    },
                    {
                        "field_code": "standing_water_near_home",
                        "value": "no",
                        "unit": "status",
                        "observed_at": _FRESH_TS,
                    },
                ],
                "environmental_observations": [
                    {
                        "observation_type": "rainfall",
                        "value": 5.0,
                        "unit": "mm",
                        "observed_at": _FRESH_TS,
                        "quality_status": bad_quality,
                    },
                    {
                        "observation_type": "temperature",
                        "value": 15.0,
                        "unit": "C",
                        "observed_at": _FRESH_TS,
                        "quality_status": "verified",
                    },
                ],
            },
        },
        enable_all_rules=True,
    )
    assert status_code == 200
    assert body["status"] == "limited"
    result = body["result"]
    assert isinstance(result, dict)
    assert result["level"] is None
    meta = body["safety_metadata"]
    assert isinstance(meta, dict)
    assert "ENVIRONMENTAL_SOURCE_UNAVAILABLE" in meta["reason_codes"]
    assert "rainfall" in meta["missing_or_stale_fields"]


def test_suite2_future_timestamp_and_unapproved_source_degrade_to_limited() -> None:
    future_ts = (_CALC_TS + timedelta(hours=2)).isoformat().replace("+00:00", "Z")
    status_code, body = _post_calc(
        {
            "inputs": {
                "health_inputs": [
                    {
                        "field_code": "physical_activity_minutes_per_week",
                        "value": 200,
                        "unit": "min/week",
                        "observed_at": future_ts,
                    },
                    {
                        "field_code": "tobacco_use_status",
                        "value": "never",
                        "unit": None,
                        "observed_at": _FRESH_TS,
                        "source_type": "imported",
                    },
                ],
                "environmental_observations": [],
            }
        }
    )
    assert status_code == 200
    assert body["status"] == "limited"
    result = body["result"]
    assert isinstance(result, dict)
    assert result["level"] is None
    meta = body["safety_metadata"]
    assert isinstance(meta, dict)
    assert "FUTURE_INPUT_TIMESTAMP" in meta["reason_codes"]
    assert "UNAPPROVED_INPUT_SOURCE" in meta["reason_codes"]


@pytest.mark.parametrize(
    ("bad_field", "bad_value", "bad_unit"),
    [
        ("physical_activity_minutes_per_week", -10, "min/week"),
        ("physical_activity_minutes_per_week", 6000, "min/week"),
        ("physical_activity_minutes_per_week", 120.5, "min/week"),
        ("physical_activity_minutes_per_week", 120, "km/week"),
        ("tobacco_use_status", "unknown_category", None),
        ("sleep_hours_avg", -1.0, "hours/day"),
        ("sleep_hours_avg", 28.0, "hours/day"),
        ("diet_fruit_veg_servings_per_day", -2, "servings/day"),
        ("diet_fruit_veg_servings_per_day", 30, "servings/day"),
    ],
)
def test_suite2_out_of_range_physiological_values_rejected_with_zero_false_low_risk(
    bad_field: str,
    bad_value: int | float | str,
    bad_unit: str | None,
) -> None:
    health_inputs: list[dict[str, object]] = [
        {
            "field_code": "physical_activity_minutes_per_week",
            "value": 200,
            "unit": "min/week",
            "observed_at": _FRESH_TS,
        },
        {
            "field_code": "tobacco_use_status",
            "value": "never",
            "unit": None,
            "observed_at": _FRESH_TS,
        },
    ]
    health_inputs = [item for item in health_inputs if item["field_code"] != bad_field]
    health_inputs.append(
        {
            "field_code": bad_field,
            "value": bad_value,
            "unit": bad_unit,
            "observed_at": _FRESH_TS,
        }
    )
    status_code, body = _post_calc(
        {"inputs": {"health_inputs": health_inputs, "environmental_observations": []}}
    )
    assert status_code == 422
    assert "result" not in body
    err = body["error"]
    assert isinstance(err, dict)
    assert err["code"] == "INVALID_INPUT_RANGE"
