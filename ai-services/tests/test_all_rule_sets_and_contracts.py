"""Contract & rule-set tests covering all 5 cataloged rule sets and unapproved-version 422 gating."""

from __future__ import annotations

import pytest
from evaluation.fixtures import (
    ALL_RULE_VERSION_KEYS,
    create_eval_client,
    internal_auth_headers,
)
from model_adapters.risk_adapter import DeterministicRuleEngineAdapter, RiskModelAdapter

_OBS_TS = "2026-11-25T08:00:00Z"
_CALC_TS = "2026-11-25T12:00:00Z"


def test_deterministic_rule_engine_adapter_satisfies_risk_model_adapter_protocol() -> None:
    adapter = DeterministicRuleEngineAdapter()
    assert isinstance(adapter, RiskModelAdapter)
    assert adapter.adapter_id == "deterministic-rule-engine-v1"


@pytest.mark.parametrize(
    ("use_case_code", "rule_model_version"),
    [
        ("malaria_exposure_preventive", "rules-v0.1.0-draft"),
        ("respiratory_air_quality_preventive", "rules-v0.1.0-draft"),
        ("water_hygiene_preventive", "rules-v0.1.0-draft"),
        ("wellbeing_checkin_screener", "rules-v0.1.0-draft"),
        ("unknown_future_use_case", "rules-v1.0.0"),
        ("lifestyle_ncd_preventive", "rules-v9.9.9"),
    ],
)
def test_disabled_draft_or_unknown_rule_versions_return_422_when_not_enabled(
    use_case_code: str,
    rule_model_version: str,
) -> None:
    # Default client only enables lifestyle_ncd_preventive:rules-v1.0.0
    client = create_eval_client()
    resp = client.post(
        "/internal/v1/risk-assessments/calculate",
        json={
            "request_id": "req-unapproved-rule",
            "use_case_code": use_case_code,
            "rule_model_version": rule_model_version,
            "input_snapshot_id": "snap-unapproved-rule",
            "calculated_for_timestamp": _CALC_TS,
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "preventive_risk_calculation",
                "consent_version": "v1",
            },
            "inputs": {"health_inputs": [], "environmental_observations": []},
        },
        headers=internal_auth_headers("req-unapproved-rule"),
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["error"]["code"] == "UNAPPROVED_OR_UNKNOWN_RULE_VERSION"


def test_malaria_exposure_preventive_draft_rule_set_when_enabled() -> None:
    client = create_eval_client(enabled_rule_versions=list(ALL_RULE_VERSION_KEYS))

    # High exposure: heavy rainfall (+2), vector-favorable temp (+1), never bed net (+2, floor moderate), standing water (+2) = 7 -> high
    resp_high = client.post(
        "/internal/v1/risk-assessments/calculate",
        json={
            "request_id": "req-malaria-high",
            "use_case_code": "malaria_exposure_preventive",
            "rule_model_version": "rules-v0.1.0-draft",
            "input_snapshot_id": "snap-malaria-high",
            "calculated_for_timestamp": _CALC_TS,
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "preventive_risk_calculation",
                "consent_version": "v1",
            },
            "inputs": {
                "health_inputs": [
                    {
                        "field_code": "bed_net_nightly_use",
                        "value": "never",
                        "unit": "frequency",
                        "observed_at": _OBS_TS,
                    },
                    {
                        "field_code": "standing_water_near_home",
                        "value": "yes",
                        "unit": "status",
                        "observed_at": _OBS_TS,
                    },
                ],
                "environmental_observations": [
                    {
                        "observation_type": "rainfall",
                        "value": 65.0,
                        "unit": "mm",
                        "observed_at": _OBS_TS,
                        "quality_status": "verified",
                    },
                    {
                        "observation_type": "temperature",
                        "value": 24.0,
                        "unit": "C",
                        "observed_at": _OBS_TS,
                        "quality_status": "verified",
                    },
                ],
            },
        },
        headers=internal_auth_headers("req-malaria-high"),
    )
    assert resp_high.status_code == 200
    assert resp_high.json()["result"]["level"] == "high"
    action_codes = [s["action_code"] for s in resp_high.json()["result"]["recommended_next_steps"]]
    assert "sleep_under_insecticide_treated_bed_net" in action_codes

    # Low exposure: low rainfall (0), cool temp (15C -> 0), always bed net (0), no standing water (0) -> low
    resp_low = client.post(
        "/internal/v1/risk-assessments/calculate",
        json={
            "request_id": "req-malaria-low",
            "use_case_code": "malaria_exposure_preventive",
            "rule_model_version": "rules-v0.1.0-draft",
            "input_snapshot_id": "snap-malaria-low",
            "calculated_for_timestamp": _CALC_TS,
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "preventive_risk_calculation",
                "consent_version": "v1",
            },
            "inputs": {
                "health_inputs": [
                    {
                        "field_code": "bed_net_nightly_use",
                        "value": "always",
                        "unit": "frequency",
                        "observed_at": _OBS_TS,
                    },
                    {
                        "field_code": "standing_water_near_home",
                        "value": "no",
                        "unit": "status",
                        "observed_at": _OBS_TS,
                    },
                ],
                "environmental_observations": [
                    {
                        "observation_type": "rainfall",
                        "value": 5.0,
                        "unit": "mm",
                        "observed_at": _OBS_TS,
                        "quality_status": "verified",
                    },
                    {
                        "observation_type": "temperature",
                        "value": 15.0,
                        "unit": "C",
                        "observed_at": _OBS_TS,
                        "quality_status": "verified",
                    },
                ],
            },
        },
        headers=internal_auth_headers("req-malaria-low"),
    )
    assert resp_low.status_code == 200
    assert resp_low.json()["result"]["level"] == "low"


def test_respiratory_air_quality_preventive_draft_rule_set_when_enabled() -> None:
    client = create_eval_client(enabled_rule_versions=list(ALL_RULE_VERSION_KEYS))

    resp = client.post(
        "/internal/v1/risk-assessments/calculate",
        json={
            "request_id": "req-air-high",
            "use_case_code": "respiratory_air_quality_preventive",
            "rule_model_version": "rules-v0.1.0-draft",
            "input_snapshot_id": "snap-air-high",
            "calculated_for_timestamp": _CALC_TS,
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "preventive_risk_calculation",
                "consent_version": "v1",
            },
            "inputs": {
                "health_inputs": [
                    {
                        "field_code": "outdoor_exertion_hours_per_day",
                        "value": 4.5,
                        "unit": "hours/day",
                        "observed_at": _OBS_TS,
                    },
                    {
                        "field_code": "indoor_solid_fuel_smoke_exposure",
                        "value": "yes",
                        "unit": "status",
                        "observed_at": _OBS_TS,
                    },
                ],
                "environmental_observations": [
                    {
                        "observation_type": "pm25",
                        "value": 72.0,
                        "unit": "ug/m3",
                        "observed_at": _OBS_TS,
                        "quality_status": "verified",
                    }
                ],
            },
        },
        headers=internal_auth_headers("req-air-high"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "complete"
    assert body["result"]["level"] == "high"
    actions = [s["action_code"] for s in body["result"]["recommended_next_steps"]]
    assert "improve_kitchen_ventilation_during_cooking" in actions


def test_water_hygiene_preventive_draft_rule_set_when_enabled() -> None:
    client = create_eval_client(enabled_rule_versions=list(ALL_RULE_VERSION_KEYS))

    # Moderate via untreated water floor (+3, floor moderate) + low rainfall (0) + consistent handwashing (0) = 3 -> moderate
    resp = client.post(
        "/internal/v1/risk-assessments/calculate",
        json={
            "request_id": "req-wash-mod",
            "use_case_code": "water_hygiene_preventive",
            "rule_model_version": "rules-v0.1.0-draft",
            "input_snapshot_id": "snap-wash-mod",
            "calculated_for_timestamp": _CALC_TS,
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "preventive_risk_calculation",
                "consent_version": "v1",
            },
            "inputs": {
                "health_inputs": [
                    {
                        "field_code": "drinking_water_treatment",
                        "value": "untreated",
                        "unit": "status",
                        "observed_at": _OBS_TS,
                    },
                    {
                        "field_code": "handwashing_with_soap_frequency",
                        "value": "consistent",
                        "unit": "frequency",
                        "observed_at": _OBS_TS,
                    },
                ],
                "environmental_observations": [
                    {
                        "observation_type": "rainfall",
                        "value": 8.0,
                        "unit": "mm",
                        "observed_at": _OBS_TS,
                        "quality_status": "verified",
                    }
                ],
            },
        },
        headers=internal_auth_headers("req-wash-mod"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["implementation_type"] == "rule"
    assert body["result"]["level"] == "moderate"
    actions = [s["action_code"] for s in body["result"]["recommended_next_steps"]]
    assert "use_boiled_filtered_or_verified_safe_water" in actions


def test_wellbeing_checkin_screener_draft_rule_set_when_enabled() -> None:
    client = create_eval_client(enabled_rule_versions=list(ALL_RULE_VERSION_KEYS))

    resp = client.post(
        "/internal/v1/risk-assessments/calculate",
        json={
            "request_id": "req-wb-high",
            "use_case_code": "wellbeing_checkin_screener",
            "rule_model_version": "rules-v0.1.0-draft",
            "input_snapshot_id": "snap-wb-high",
            "calculated_for_timestamp": _CALC_TS,
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "wellbeing_check_ins",
                "consent_version": "v1",
            },
            "inputs": {
                "health_inputs": [],
                "environmental_observations": [],
                "check_in_responses": [
                    {"question_code": "stress_frequency_score", "value": 3, "observed_at": _OBS_TS},
                    {"question_code": "exhaustion_score", "value": 3, "observed_at": _OBS_TS},
                    {"question_code": "sleep_quality_score", "value": 3, "observed_at": _OBS_TS},
                    {"question_code": "self_harm_signal", "value": 0, "observed_at": _OBS_TS},
                ],
            },
        },
        headers=internal_auth_headers("req-wb-high"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "complete"
    assert body["result"]["level"] == "high"
    actions = [s["action_code"] for s in body["result"]["recommended_next_steps"]]
    assert "review_sleep_routine_guidance" in actions


def test_strict_contracts_reject_extra_pii_and_boolean_scalars() -> None:
    client = create_eval_client()

    # Extra PII field rejected
    r_extra = client.post(
        "/internal/v1/risk-assessments/calculate",
        json={
            "request_id": "req-extra-pii",
            "use_case_code": "lifestyle_ncd_preventive",
            "rule_model_version": "rules-v1.0.0",
            "input_snapshot_id": "snap-extra-pii",
            "calculated_for_timestamp": _CALC_TS,
            "national_id": "1199080000000000",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "preventive_risk_calculation",
                "consent_version": "v1",
            },
            "inputs": {"health_inputs": [], "environmental_observations": []},
        },
        headers=internal_auth_headers("req-extra-pii"),
    )
    assert r_extra.status_code == 422

    # Boolean value in health_inputs rejected
    r_bool = client.post(
        "/internal/v1/risk-assessments/calculate",
        json={
            "request_id": "req-bool",
            "use_case_code": "lifestyle_ncd_preventive",
            "rule_model_version": "rules-v1.0.0",
            "input_snapshot_id": "snap-bool",
            "calculated_for_timestamp": _CALC_TS,
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "preventive_risk_calculation",
                "consent_version": "v1",
            },
            "inputs": {
                "health_inputs": [
                    {
                        "field_code": "physical_activity_minutes_per_week",
                        "value": True,
                        "unit": "min/week",
                        "observed_at": _OBS_TS,
                    }
                ],
                "environmental_observations": [],
            },
        },
        headers=internal_auth_headers("req-bool"),
    )
    assert r_bool.status_code == 422
