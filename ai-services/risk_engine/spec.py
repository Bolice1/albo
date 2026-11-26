"""Declarative specification structures for Albo's deterministic risk engine (RISK_SCORING.md §5)."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Literal

from app.contracts.common import (
    FactorDirection,
    ImplementationType,
    NextStepPriority,
    RiskLevel,
)
from data_processing.types import InputFieldSpec, NormalizedFieldValue

ClinicalReviewStatus = Literal["draft", "under_review", "approved", "retired"]


@dataclass(frozen=True, slots=True)
class EvaluatedFactor:
    """Outcome of evaluating a single rule factor against a normalized input."""

    factor_code: str
    source_field: str
    points: float
    direction: FactorDirection
    explanation_key: str
    floor_level: RiskLevel | None = None


FactorEvaluatorFn = Callable[[NormalizedFieldValue], EvaluatedFactor | None]


@dataclass(frozen=True, slots=True)
class LevelThresholdBand:
    """Inclusive point band mapping total weighted points to a discrete risk level."""

    level: RiskLevel
    min_points: float
    max_points: float | None
    summary_code: str


@dataclass(frozen=True, slots=True)
class NextStepTemplate:
    """Pre-approved non-prescriptive preventive recommendation template."""

    action_code: str
    priority: NextStepPriority
    facility_service_tags: tuple[str, ...] | None = None


@dataclass(frozen=True, slots=True)
class RuleSetSpec:
    """Complete immutable rule-card specification (MODEL_DOCUMENTATION.md §4 & RISK_SCORING.md §5)."""

    use_case_code: str
    rule_model_version: str
    name: str
    implementation_type: ImplementationType
    approval_status: ClinicalReviewStatus
    guideline_references: tuple[str, ...]
    intended_use: str
    excluded_use: str
    fields: tuple[InputFieldSpec, ...]
    factor_evaluators: tuple[tuple[str, FactorEvaluatorFn], ...]
    level_thresholds: tuple[LevelThresholdBand, ...]
    base_limitation: str
    provenance_limitation: str
    next_steps_by_level: Mapping[RiskLevel, tuple[NextStepTemplate, ...]]
    factor_specific_next_steps: Mapping[str, NextStepTemplate]
    high_risk_facility_tags: tuple[str, ...]

    @property
    def version_key(self) -> str:
        return f"{self.use_case_code}:{self.rule_model_version}"
