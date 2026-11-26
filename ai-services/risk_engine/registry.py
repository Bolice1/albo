"""Immutable registry of documented risk rule specifications."""

from __future__ import annotations

from collections.abc import Collection, Iterable

from app.errors import UnapprovedRuleVersionError

from risk_engine.rules import ALL_CATALOGED_RULE_SPECS
from risk_engine.spec import RuleSetSpec


class RuleRegistry:
    """Lookup and activation gate for version-pinned RuleSetSpec definitions."""

    def __init__(self, specs: Iterable[RuleSetSpec] = ALL_CATALOGED_RULE_SPECS) -> None:
        by_key: dict[str, RuleSetSpec] = {}
        for spec in specs:
            if spec.version_key in by_key:
                msg = f"Duplicate rule specification registered: {spec.version_key}"
                raise ValueError(msg)
            by_key[spec.version_key] = spec
        self._specs = by_key

    def get(self, use_case_code: str, rule_model_version: str) -> RuleSetSpec | None:
        return self._specs.get(f"{use_case_code}:{rule_model_version}")

    def resolve_enabled_spec(
        self,
        use_case_code: str,
        rule_model_version: str,
        *,
        enabled_versions: Collection[str],
    ) -> RuleSetSpec:
        key = f"{use_case_code}:{rule_model_version}"
        spec = self._specs.get(key)
        if spec is None or spec.approval_status == "retired" or key not in enabled_versions:
            raise UnapprovedRuleVersionError(
                field="use_case_code"
                if not any(k.startswith(f"{use_case_code}:") for k in self._specs)
                else "rule_model_version"
            )
        return spec

    def list_loaded_versions(self, *, enabled_versions: Collection[str]) -> list[str]:
        return [key for key in enabled_versions if key in self._specs]

    @property
    def all_specs(self) -> tuple[RuleSetSpec, ...]:
        return tuple(self._specs.values())


DEFAULT_RULE_REGISTRY = RuleRegistry()
