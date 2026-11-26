"""Uniform model adapter interfaces, curated preventive knowledge base, and Stage 1 adapters."""

from model_adapters.assistant_adapter import (
    STAGE1_ASSISTANT_ADAPTER_VERSION,
    AssistantModelAdapter,
    TemplateGuidedAssistantAdapter,
    run_guarded_assistant_turn,
)
from model_adapters.knowledge_base import (
    GENERAL_PREVENTIVE_FALLBACK_SNIPPET,
    KNOWLEDGE_BASE_VERSION,
    PREVENTIVE_KNOWLEDGE_BASE,
    KnowledgeSnippet,
    match_knowledge_snippet,
)
from model_adapters.risk_adapter import (
    DETERMINISTIC_ADAPTER_ID,
    DeterministicRuleEngineAdapter,
    RiskModelAdapter,
)

__all__ = [
    "DETERMINISTIC_ADAPTER_ID",
    "GENERAL_PREVENTIVE_FALLBACK_SNIPPET",
    "KNOWLEDGE_BASE_VERSION",
    "PREVENTIVE_KNOWLEDGE_BASE",
    "STAGE1_ASSISTANT_ADAPTER_VERSION",
    "AssistantModelAdapter",
    "DeterministicRuleEngineAdapter",
    "KnowledgeSnippet",
    "RiskModelAdapter",
    "TemplateGuidedAssistantAdapter",
    "match_knowledge_snippet",
    "run_guarded_assistant_turn",
]
