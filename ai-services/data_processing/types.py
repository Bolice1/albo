"""Pure value objects for input snapshot completeness, range, and freshness validation."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

InputDomain = Literal["health_input", "environmental_observation", "check_in_response"]
ScalarInputValue = int | float | str


@dataclass(frozen=True, slots=True)
class InputFieldSpec:
    """Declarative validation contract for a single rule-set input field (RISK_SCORING.md §5.2)."""

    field_code: str
    domain: InputDomain
    required: bool
    max_age_hours: float
    allowed_sources: tuple[str, ...] = ("self_reported",)
    allowed_units: tuple[str, ...] | None = None
    min_value: float | None = None
    max_value: float | None = None
    integer_only: bool = False
    enum_values: tuple[str, ...] | None = None


@dataclass(frozen=True, slots=True)
class NormalizedFieldValue:
    """Validated, provenance-preserving scalar value ready for pure rule evaluation."""

    field_code: str
    domain: InputDomain
    value: ScalarInputValue
    observed_at: datetime
    source_type: str


@dataclass(frozen=True, slots=True)
class ValidatedSnapshot:
    """Outcome of completeness, quality, provenance, and freshness checks."""

    is_complete_for_scoring: bool
    fields: Mapping[str, NormalizedFieldValue]
    missing_or_stale_fields: tuple[str, ...]
    omitted_optional_fields: tuple[str, ...]
    reason_codes: tuple[str, ...]
    used_self_reported: bool
    used_environmental: bool
