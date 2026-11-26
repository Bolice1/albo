"""Deterministic rule-based and weighted preventive risk engine."""

from risk_engine.pipeline import evaluate_risk_assessment, evaluate_with_spec
from risk_engine.registry import DEFAULT_RULE_REGISTRY, RuleRegistry
from risk_engine.rules import (
    ALL_CATALOGED_RULE_SPECS,
    LIFESTYLE_NCD_V1_0_0_SPEC,
    MALARIA_EXPOSURE_V0_1_0_SPEC,
    RESPIRATORY_AIR_QUALITY_V0_1_0_SPEC,
    WATER_HYGIENE_V0_1_0_SPEC,
    WELLBEING_CHECKIN_V0_1_0_SPEC,
)
from risk_engine.spec import (
    ClinicalReviewStatus,
    EvaluatedFactor,
    FactorEvaluatorFn,
    LevelThresholdBand,
    NextStepTemplate,
    RuleSetSpec,
)

__all__ = [
    "ALL_CATALOGED_RULE_SPECS",
    "DEFAULT_RULE_REGISTRY",
    "LIFESTYLE_NCD_V1_0_0_SPEC",
    "MALARIA_EXPOSURE_V0_1_0_SPEC",
    "RESPIRATORY_AIR_QUALITY_V0_1_0_SPEC",
    "WATER_HYGIENE_V0_1_0_SPEC",
    "WELLBEING_CHECKIN_V0_1_0_SPEC",
    "ClinicalReviewStatus",
    "EvaluatedFactor",
    "FactorEvaluatorFn",
    "LevelThresholdBand",
    "NextStepTemplate",
    "RuleRegistry",
    "RuleSetSpec",
    "evaluate_risk_assessment",
    "evaluate_with_spec",
]
