"""Unit & integration tests for fail-fast Settings, InternalAuthMiddleware, and RequestIdMiddleware."""

from __future__ import annotations

import uuid

import pytest
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient
from pydantic import ValidationError

_VALID_SYNTHETIC_TOKEN = "example-placeholder-unit-test-service-token-only"  # ggignore


def test_settings_fails_fast_when_internal_service_token_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("INTERNAL_SERVICE_TOKEN", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


@pytest.mark.parametrize(
    "short_or_blank_token",
    [
        "",
        "short-token",
        "x" * 31,
        "   " + ("x" * 20) + "               ",
    ],
)
def test_settings_fails_fast_when_internal_service_token_under_32_chars(
    short_or_blank_token: str,
) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, INTERNAL_SERVICE_TOKEN=short_or_blank_token)


def test_settings_parses_enabled_rule_versions_and_enforces_staging_prod_gates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", _VALID_SYNTHETIC_TOKEN)
    monkeypatch.setenv(
        "ENABLED_RULE_VERSIONS",
        "lifestyle_ncd_preventive:rules-v1.0.0, malaria_exposure_preventive:rules-v0.1.0-draft",
    )
    s_csv = Settings(_env_file=None)
    assert s_csv.ENABLED_RULE_VERSIONS == [
        "lifestyle_ncd_preventive:rules-v1.0.0",
        "malaria_exposure_preventive:rules-v0.1.0-draft",
    ]

    monkeypatch.setenv("ENABLED_RULE_VERSIONS", '["lifestyle_ncd_preventive:rules-v1.0.0"]')
    s_json = Settings(_env_file=None)
    assert s_json.ENABLED_RULE_VERSIONS == ["lifestyle_ncd_preventive:rules-v1.0.0"]

    with pytest.raises(ValidationError, match="Draft rule versions"):
        Settings(
            ENVIRONMENT="production",
            INTERNAL_SERVICE_TOKEN=_VALID_SYNTHETIC_TOKEN,
            ENABLED_RULE_VERSIONS=["malaria_exposure_preventive:rules-v0.1.0-draft"],
        )

    with pytest.raises(ValidationError, match="CHECKIN_SAFETY_ENABLED"):
        Settings(
            ENVIRONMENT="staging",
            INTERNAL_SERVICE_TOKEN=_VALID_SYNTHETIC_TOKEN,
            CHECKIN_SAFETY_ENABLED=False,
        )


def test_health_endpoint_is_unauthenticated_and_echoes_loaded_versions() -> None:
    settings = Settings(
        ENVIRONMENT="test",
        INTERNAL_SERVICE_TOKEN=_VALID_SYNTHETIC_TOKEN,
        ASSISTANT_ENABLED=False,
    )
    client = TestClient(create_app(settings))

    resp = client.get("/internal/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "albo-ai-services"
    assert body["loaded_rule_versions"] == ["lifestyle_ncd_preventive:rules-v1.0.0"]
    assert body["assistant_enabled"] is False
    assert "X-Request-Id" in resp.headers
    assert body["request_id"] == resp.headers["X-Request-Id"]


@pytest.mark.parametrize(
    "protected_path",
    [
        "/internal/v1/risk-assessments/calculate",
        "/internal/v1/check-ins/evaluate-safety",
        "/internal/v1/assistant/respond",
    ],
)
def test_internal_auth_middleware_rejects_missing_or_wrong_token_with_401(
    protected_path: str,
) -> None:
    settings = Settings(
        ENVIRONMENT="test",
        INTERNAL_SERVICE_TOKEN=_VALID_SYNTHETIC_TOKEN,
        ASSISTANT_ENABLED=True,
    )
    client = TestClient(create_app(settings))

    resp_missing = client.post(protected_path, json={})
    assert resp_missing.status_code == 401
    assert resp_missing.json()["error"]["code"] == "UNAUTHENTICATED"

    resp_wrong = client.post(
        protected_path,
        json={},
        headers={"X-Internal-Service-Token": "wrong-synthetic-token-value-00000000"},
    )
    assert resp_wrong.status_code == 401
    assert resp_wrong.json()["error"]["code"] == "UNAUTHENTICATED"


def test_request_id_middleware_echoes_safe_id_and_replaces_unsafe_id() -> None:
    settings = Settings(
        ENVIRONMENT="test",
        INTERNAL_SERVICE_TOKEN=_VALID_SYNTHETIC_TOKEN,
    )
    client = TestClient(create_app(settings))

    safe_id = "req-trace-abc_123.456"
    r_safe = client.get("/internal/v1/health", headers={"X-Request-Id": safe_id})
    assert r_safe.headers["X-Request-Id"] == safe_id
    assert r_safe.json()["request_id"] == safe_id

    unsafe_id = "bad id with spaces / <script>"
    r_unsafe = client.get("/internal/v1/health", headers={"X-Request-Id": unsafe_id})
    generated = r_unsafe.headers["X-Request-Id"]
    assert generated != unsafe_id
    parsed_uuid = uuid.UUID(generated)
    assert parsed_uuid.version == 4
