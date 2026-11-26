"""Suite 7: Log & error redaction evaluation (AI_SAFETY.md §5 Suite 7, T-017, HAZ-09)."""

from __future__ import annotations

import json
import logging
from collections.abc import Collection

import pytest
from app.config import Settings
from app.contracts.risk_assessment import RiskCalculationRequest, RiskCalculationResponse
from app.logging import ALLOWED_LOG_FIELDS, LOGGER_NAME, RedactedJsonFormatter
from app.main import create_app
from fastapi.testclient import TestClient

from evaluation.fixtures import SYNTHETIC_SERVICE_TOKEN, internal_auth_headers


class _ListBufferHandler(logging.Handler):
    """In-memory log handler capturing formatted JSON lines emitted by albo.ai_services."""

    def __init__(self) -> None:
        super().__init__()
        self.lines: list[str] = []
        self.setFormatter(RedactedJsonFormatter(service="albo-ai-services", environment="test"))

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(self.format(record))


class _CrashingRiskAdapter:
    """Synthetic adapter raising an internal error containing a canary secret string."""

    def __init__(self, canary_secret: str) -> None:
        self._canary = canary_secret

    @property
    def adapter_id(self) -> str:
        return "crashing-test-adapter"

    def list_loaded_versions(self, *, enabled_versions: Collection[str]) -> list[str]:
        return list(enabled_versions)

    def calculate_risk(
        self,
        request: RiskCalculationRequest,
        *,
        enabled_versions: Collection[str],
    ) -> RiskCalculationResponse:
        _ = (request, enabled_versions)
        raise RuntimeError(f"DB_PASSWORD_LEAK={self._canary}")


def _attach_capture_handler() -> _ListBufferHandler:
    logger = logging.getLogger(LOGGER_NAME)
    capture = _ListBufferHandler()
    logger.addHandler(capture)
    return capture


def _assert_zero_canary_leaks_and_allowlisted_keys(
    *,
    raw_http_text: str,
    log_lines: list[str],
    stdout_text: str,
    canaries: tuple[str, ...],
) -> None:
    for canary in canaries:
        assert canary not in raw_http_text
        assert canary not in stdout_text
        for line in log_lines:
            assert canary not in line

    assert len(log_lines) >= 1
    for line in log_lines:
        parsed: object = json.loads(line)
        assert isinstance(parsed, dict)
        for key in parsed:
            assert key in ALLOWED_LOG_FIELDS


def test_suite7_zero_leaks_on_401_invalid_internal_token(
    capsys: pytest.CaptureFixture[str],
) -> None:
    settings = Settings(
        ENVIRONMENT="test",
        INTERNAL_SERVICE_TOKEN=SYNTHETIC_SERVICE_TOKEN,
        ASSISTANT_ENABLED=True,
    )
    app = create_app(settings)
    capture = _attach_capture_handler()
    client = TestClient(app, raise_server_exceptions=False)

    wrong_token_canary = "SYNTHETIC_ATTACKER_BEARER_TOKEN_CANARY_401"
    msg_canary = "SYNTHETIC_PRIVATE_SYMPTOM_CANARY_401"

    resp = client.post(
        "/internal/v1/assistant/respond",
        json={
            "request_id": "req-redaction-401",
            "conversation_id": "conv-redaction-401",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "assistant_conversations",
                "consent_version": "v1",
            },
            "user_message": msg_canary,
        },
        headers={
            "X-Internal-Service-Token": wrong_token_canary,
            "X-Request-Id": "req-redaction-401",
        },
    )
    assert resp.status_code == 401
    captured_io = capsys.readouterr()
    _assert_zero_canary_leaks_and_allowlisted_keys(
        raw_http_text=resp.text,
        log_lines=capture.lines,
        stdout_text=captured_io.out + captured_io.err,
        canaries=(wrong_token_canary, msg_canary, SYNTHETIC_SERVICE_TOKEN),
    )


def test_suite7_zero_leaks_on_422_pydantic_and_domain_validation_errors(
    capsys: pytest.CaptureFixture[str],
) -> None:
    settings = Settings(
        ENVIRONMENT="test",
        INTERNAL_SERVICE_TOKEN=SYNTHETIC_SERVICE_TOKEN,
        ASSISTANT_ENABLED=True,
    )
    app = create_app(settings)
    capture = _attach_capture_handler()
    client = TestClient(app, raise_server_exceptions=False)

    pii_name_canary = "SYNTHETIC_FULL_NAME_PII_CANARY_Jane_Doe"
    secret_value_canary = "SYNTHETIC_HEALTH_VALUE_CANARY_888777"
    range_canary = -999888

    # 1. Pydantic RequestValidationError (extra PII field + wrong value type)
    resp_pydantic = client.post(
        "/internal/v1/risk-assessments/calculate",
        json={
            "request_id": "req-redaction-422a",
            "use_case_code": "lifestyle_ncd_preventive",
            "rule_model_version": "rules-v1.0.0",
            "input_snapshot_id": "snap-redaction-422a",
            "calculated_for_timestamp": "2026-11-25T12:00:00Z",
            "patient_full_name": pii_name_canary,
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "preventive_risk_calculation",
                "consent_version": "v1",
            },
            "inputs": {
                "health_inputs": [
                    {
                        "field_code": "physical_activity_minutes_per_week",
                        "value": secret_value_canary,
                        "unit": "min/week",
                        "observed_at": "not-a-timestamp-" + secret_value_canary,
                    }
                ]
            },
        },
        headers=internal_auth_headers("req-redaction-422a"),
    )
    assert resp_pydantic.status_code == 422

    # 2. Domain InvalidInputRangeError (numeric canary outside physiological range)
    resp_domain = client.post(
        "/internal/v1/risk-assessments/calculate",
        json={
            "request_id": "req-redaction-422b",
            "use_case_code": "lifestyle_ncd_preventive",
            "rule_model_version": "rules-v1.0.0",
            "input_snapshot_id": "snap-redaction-422b",
            "calculated_for_timestamp": "2026-11-25T12:00:00Z",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "preventive_risk_calculation",
                "consent_version": "v1",
            },
            "inputs": {
                "health_inputs": [
                    {
                        "field_code": "physical_activity_minutes_per_week",
                        "value": range_canary,
                        "unit": "min/week",
                        "observed_at": "2026-11-25T08:00:00Z",
                    },
                    {
                        "field_code": "tobacco_use_status",
                        "value": "never",
                        "unit": None,
                        "observed_at": "2026-11-25T08:00:00Z",
                    },
                ]
            },
        },
        headers=internal_auth_headers("req-redaction-422b"),
    )
    assert resp_domain.status_code == 422

    captured_io = capsys.readouterr()
    _assert_zero_canary_leaks_and_allowlisted_keys(
        raw_http_text=resp_pydantic.text + resp_domain.text,
        log_lines=capture.lines,
        stdout_text=captured_io.out + captured_io.err,
        canaries=(
            pii_name_canary,
            secret_value_canary,
            str(range_canary),
            SYNTHETIC_SERVICE_TOKEN,
        ),
    )


def test_suite7_zero_leaks_on_500_unhandled_internal_exception(
    capsys: pytest.CaptureFixture[str],
) -> None:
    crash_canary = "SYNTHETIC_INTERNAL_CREDENTIAL_CANARY_500_SECRET"
    settings = Settings(
        ENVIRONMENT="test",
        INTERNAL_SERVICE_TOKEN=SYNTHETIC_SERVICE_TOKEN,
        ASSISTANT_ENABLED=True,
    )
    app = create_app(settings, risk_adapter=_CrashingRiskAdapter(crash_canary))
    capture = _attach_capture_handler()
    client = TestClient(app, raise_server_exceptions=False)

    resp = client.post(
        "/internal/v1/risk-assessments/calculate",
        json={
            "request_id": "req-redaction-500",
            "use_case_code": "lifestyle_ncd_preventive",
            "rule_model_version": "rules-v1.0.0",
            "input_snapshot_id": "snap-redaction-500",
            "calculated_for_timestamp": "2026-11-25T12:00:00Z",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "preventive_risk_calculation",
                "consent_version": "v1",
            },
            "inputs": {
                "health_inputs": [
                    {
                        "field_code": "physical_activity_minutes_per_week",
                        "value": 180,
                        "unit": "min/week",
                        "observed_at": "2026-11-25T08:00:00Z",
                    },
                    {
                        "field_code": "tobacco_use_status",
                        "value": "never",
                        "unit": None,
                        "observed_at": "2026-11-25T08:00:00Z",
                    },
                ]
            },
        },
        headers=internal_auth_headers("req-redaction-500"),
    )
    assert resp.status_code == 500
    body = resp.json()
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert "Traceback" not in resp.text

    captured_io = capsys.readouterr()
    _assert_zero_canary_leaks_and_allowlisted_keys(
        raw_http_text=resp.text,
        log_lines=capture.lines,
        stdout_text=captured_io.out + captured_io.err,
        canaries=(crash_canary, SYNTHETIC_SERVICE_TOKEN),
    )


def test_suite7_zero_sensitive_payload_logging_on_200_checkin_and_assistant_turns(
    capsys: pytest.CaptureFixture[str],
) -> None:
    settings = Settings(
        ENVIRONMENT="test",
        INTERNAL_SERVICE_TOKEN=SYNTHETIC_SERVICE_TOKEN,
        ASSISTANT_ENABLED=True,
        CHECKIN_SAFETY_ENABLED=True,
    )
    app = create_app(settings)
    capture = _attach_capture_handler()
    client = TestClient(app, raise_server_exceptions=False)

    reflection_canary = "SYNTHETIC_SENSITIVE_REFLECTION_CANARY_WANT_TO_DIE_777"
    assistant_canary = "SYNTHETIC_ASSISTANT_PROMPT_CANARY_WALKING_ROUTINE_888"

    r1 = client.post(
        "/internal/v1/check-ins/evaluate-safety",
        json={
            "request_id": "req-redaction-200a",
            "questionnaire_version": "checkin-v1.0.0",
            "completed_at": "2026-11-25T10:00:00Z",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "wellbeing_check_ins",
                "consent_version": "v1",
            },
            "responses": {"stress_frequency_score": 3},
            "free_text_reflection": f"I want to die {reflection_canary}",
        },
        headers=internal_auth_headers("req-redaction-200a"),
    )
    assert r1.status_code == 200

    r2 = client.post(
        "/internal/v1/assistant/respond",
        json={
            "request_id": "req-redaction-200b",
            "conversation_id": "conv-redaction-200b",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "assistant_conversations",
                "consent_version": "v1",
            },
            "user_message": f"How much walking helps health? {assistant_canary}",
        },
        headers=internal_auth_headers("req-redaction-200b"),
    )
    assert r2.status_code == 200

    captured_io = capsys.readouterr()
    # Logs must NOT contain either canary or the internal token
    _assert_zero_canary_leaks_and_allowlisted_keys(
        raw_http_text="{}",
        log_lines=capture.lines,
        stdout_text=captured_io.out + captured_io.err,
        canaries=(reflection_canary, assistant_canary, SYNTHETIC_SERVICE_TOKEN),
    )
