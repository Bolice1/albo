"""Typed synthetic dataset loaders and test-client builders for pre-release safety suites."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Final

from app.config import DEFAULT_ENABLED_RULE_VERSIONS, Settings
from app.main import create_app
from fastapi.testclient import TestClient
from model_adapters.assistant_adapter import AssistantModelAdapter
from risk_engine.rules import ALL_CATALOGED_RULE_SPECS

SYNTHETIC_DATA_DIR: Final[Path] = Path(__file__).resolve().parent / "datasets" / "synthetic"
SYNTHETIC_SERVICE_TOKEN: Final[str] = (
    "example-placeholder-eval-internal-service-token-only"  # ggignore
)
ALL_RULE_VERSION_KEYS: Final[tuple[str, ...]] = tuple(
    spec.version_key for spec in ALL_CATALOGED_RULE_SPECS
)


def load_synthetic_json(filename: str) -> dict[str, object]:
    """Load a synthetic fixture JSON file and enforce DP-005 synthetic provenance tags."""
    path = SYNTHETIC_DATA_DIR / filename
    raw: object = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        msg = f"Expected JSON object in {filename}"
        raise TypeError(msg)
    if raw.get("synthetic") is not True or raw.get("source") != "synthetic_test_fixture":
        msg = f"Dataset {filename} is missing mandatory synthetic provenance markers."
        raise ValueError(msg)
    return raw


def create_eval_client(
    *,
    assistant_enabled: bool = True,
    checkin_safety_enabled: bool = True,
    enabled_rule_versions: list[str] | None = None,
    assistant_adapter: AssistantModelAdapter | None = None,
    raise_server_exceptions: bool = True,
) -> TestClient:
    """Create an isolated FastAPI TestClient configured strictly with synthetic settings."""
    versions = (
        enabled_rule_versions
        if enabled_rule_versions is not None
        else list(DEFAULT_ENABLED_RULE_VERSIONS)
    )
    settings = Settings(
        ENVIRONMENT="test",
        INTERNAL_SERVICE_TOKEN=SYNTHETIC_SERVICE_TOKEN,
        ENABLED_RULE_VERSIONS=versions,
        ASSISTANT_ENABLED=assistant_enabled,
        CHECKIN_SAFETY_ENABLED=checkin_safety_enabled,
        LOG_LEVEL="INFO",
    )
    app = create_app(settings, assistant_adapter=assistant_adapter)
    return TestClient(app, raise_server_exceptions=raise_server_exceptions)


def internal_auth_headers(request_id: str = "req-synthetic-eval-001") -> dict[str, str]:
    """Return standard internal service auth headers using the synthetic test token."""
    return {
        "X-Internal-Service-Token": SYNTHETIC_SERVICE_TOKEN,
        "X-Request-Id": request_id,
    }
