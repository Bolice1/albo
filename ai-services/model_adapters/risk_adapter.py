"""Uniform risk-model adapter interface and Phase 1 deterministic rule-engine adapter."""

from __future__ import annotations

from collections.abc import Collection
from typing import Final, Protocol, runtime_checkable

from app.contracts.risk_assessment import RiskCalculationRequest, RiskCalculationResponse
from risk_engine.pipeline import evaluate_risk_assessment
from risk_engine.registry import DEFAULT_RULE_REGISTRY, RuleRegistry

DETERMINISTIC_ADAPTER_ID: Final[str] = "deterministic-rule-engine-v1"


@runtime_checkable
class RiskModelAdapter(Protocol):
    """Uniform contract for approved rule runners and future Phase 3 validated ML adapters."""

    @property
    def adapter_id(self) -> str:
        """Stable identifier for auditability and telemetry."""

    def list_loaded_versions(self, *, enabled_versions: Collection[str]) -> list[str]:
        """Return currently enabled and registered use_case_code:rule_model_version keys."""

    def calculate_risk(
        self,
        request: RiskCalculationRequest,
        *,
        enabled_versions: Collection[str],
    ) -> RiskCalculationResponse:
        """Execute a reproducible non-diagnostic risk calculation on an immutable snapshot."""


class DeterministicRuleEngineAdapter:
    """Phase 1 adapter delegating strictly to version-pinned specifications in risk_engine."""

    def __init__(self, registry: RuleRegistry = DEFAULT_RULE_REGISTRY) -> None:
        self._registry = registry

    @property
    def adapter_id(self) -> str:
        return DETERMINISTIC_ADAPTER_ID

    @property
    def registry(self) -> RuleRegistry:
        return self._registry

    def list_loaded_versions(self, *, enabled_versions: Collection[str]) -> list[str]:
        return self._registry.list_loaded_versions(enabled_versions=enabled_versions)

    def calculate_risk(
        self,
        request: RiskCalculationRequest,
        *,
        enabled_versions: Collection[str],
    ) -> RiskCalculationResponse:
        return evaluate_risk_assessment(
            request,
            enabled_versions=enabled_versions,
            registry=self._registry,
        )
