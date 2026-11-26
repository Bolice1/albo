"""Tests for assistant kill switch, Stage 1 intent routing, knowledge base, and check-in safety."""

from __future__ import annotations

import pytest
from app.contracts.assistant import AssistantRespondRequest, AssistantRespondResponse
from app.safety.escalation_templates import ASSISTANT_UNAVAILABLE_MESSAGE
from evaluation.fixtures import create_eval_client, internal_auth_headers
from model_adapters.assistant_adapter import (
    STAGE1_ASSISTANT_ADAPTER_VERSION,
    AssistantModelAdapter,
    TemplateGuidedAssistantAdapter,
)
from model_adapters.knowledge_base import KNOWLEDGE_BASE_VERSION, PREVENTIVE_KNOWLEDGE_BASE


class _FailingAssistantAdapter:
    """Synthetic adapter simulating runtime timeout or dependency failure."""

    @property
    def adapter_version(self) -> str:
        return "assistant-v0.1.0-failing-mock"

    def respond(self, request: AssistantRespondRequest) -> AssistantRespondResponse:
        _ = request
        raise TimeoutError("Simulated upstream model timeout")


def test_template_guided_adapter_satisfies_assistant_model_adapter_protocol() -> None:
    adapter = TemplateGuidedAssistantAdapter()
    assert isinstance(adapter, AssistantModelAdapter)
    assert adapter.adapter_version == STAGE1_ASSISTANT_ADAPTER_VERSION


def test_assistant_kill_switch_returns_503_feature_disabled_when_disabled() -> None:
    client = create_eval_client(assistant_enabled=False)
    resp = client.post(
        "/internal/v1/assistant/respond",
        json={
            "request_id": "req-killswitch-asst",
            "conversation_id": "conv-killswitch-asst",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "assistant_conversations",
                "consent_version": "v1",
            },
            "user_message": "Can you share healthy sleep habits?",
        },
        headers=internal_auth_headers("req-killswitch-asst"),
    )
    assert resp.status_code == 503
    body = resp.json()
    assert body["error"]["code"] == "FEATURE_DISABLED"
    assert body["error"]["message"] == ASSISTANT_UNAVAILABLE_MESSAGE


def test_checkin_kill_switch_returns_503_feature_disabled_when_disabled_in_test() -> None:
    client = create_eval_client(checkin_safety_enabled=False)
    resp = client.post(
        "/internal/v1/check-ins/evaluate-safety",
        json={
            "request_id": "req-killswitch-checkin",
            "questionnaire_version": "checkin-v1.0.0",
            "completed_at": "2026-11-25T10:00:00Z",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "wellbeing_check_ins",
                "consent_version": "v1",
            },
            "responses": {"stress_frequency_score": 1},
        },
        headers=internal_auth_headers("req-killswitch-checkin"),
    )
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "FEATURE_DISABLED"


def test_assistant_structured_explanation_for_complete_limited_and_missing_context() -> None:
    client = create_eval_client(assistant_enabled=True)

    # 1. Complete assessment explanation
    r_complete = client.post(
        "/internal/v1/assistant/respond",
        json={
            "request_id": "req-exp-complete",
            "conversation_id": "conv-exp-001",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "assistant_conversations",
                "consent_version": "v1",
            },
            "user_message": "Please explain my latest risk assessment in plain language.",
            "authorized_context_snapshot": {
                "latest_assessment": {
                    "assessment_id": "asmt-syn-101",
                    "use_case_code": "lifestyle_ncd_preventive",
                    "rule_model_version": "rules-v1.0.0",
                    "status": "complete",
                    "level": "moderate",
                    "calculated_at": "2026-11-25T09:30:00Z",
                    "contributing_factors": [
                        {
                            "factor_code": "physical_activity_very_low",
                            "source_field": "physical_activity_minutes_per_week",
                            "observed_at": "2026-11-25T08:00:00Z",
                            "source_type": "self_reported",
                            "direction": "increases_risk",
                            "explanation_key": "factor.physical_activity.very_low",
                        }
                    ],
                    "limitations": [
                        "This is a preventive risk indicator based on self-reported lifestyle information, not a medical diagnosis."
                    ],
                    "recommended_next_steps": [
                        {
                            "action_code": "review_preventive_lifestyle_guidance",
                            "priority": "standard",
                        }
                    ],
                }
            },
        },
        headers=internal_auth_headers("req-exp-complete"),
    )
    assert r_complete.status_code == 200
    b_complete = r_complete.json()
    assert b_complete["response_type"] == "explanation"
    assert b_complete["referenced_assessment_id"] == "asmt-syn-101"
    assert b_complete["rule_model_version"] == "rules-v1.0.0"
    assert "2026-11-25T09:30:00Z" in b_complete["message_text"]
    assert "rules-v1.0.0" in b_complete["message_text"]
    assert "'moderate'" in b_complete["message_text"]
    assert "physical activity very low" in b_complete["message_text"]

    # 2. Limited assessment explanation
    r_limited = client.post(
        "/internal/v1/assistant/respond",
        json={
            "request_id": "req-exp-limited",
            "conversation_id": "conv-exp-002",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "assistant_conversations",
                "consent_version": "v1",
            },
            "user_message": "What does my indicator mean?",
            "authorized_context_snapshot": {
                "latest_assessment": {
                    "assessment_id": "asmt-syn-102",
                    "use_case_code": "lifestyle_ncd_preventive",
                    "rule_model_version": "rules-v1.0.0",
                    "status": "limited",
                    "level": None,
                    "calculated_at": "2026-11-25T09:30:00Z",
                    "contributing_factors": [],
                    "limitations": [
                        "Missing required inputs; missing data never implies low risk."
                    ],
                    "recommended_next_steps": [
                        {"action_code": "provide_fresh_required_inputs", "priority": "standard"}
                    ],
                }
            },
        },
        headers=internal_auth_headers("req-exp-limited"),
    )
    assert r_limited.status_code == 200
    b_limited = r_limited.json()
    assert b_limited["response_type"] == "explanation"
    assert "limited" in b_limited["message_text"]
    assert b_limited["referenced_assessment_id"] == "asmt-syn-102"

    # 3. Missing latest_assessment context
    r_none = client.post(
        "/internal/v1/assistant/respond",
        json={
            "request_id": "req-exp-none",
            "conversation_id": "conv-exp-003",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "assistant_conversations",
                "consent_version": "v1",
            },
            "user_message": "Explain my latest assessment.",
        },
        headers=internal_auth_headers("req-exp-none"),
    )
    assert r_none.status_code == 200
    assert r_none.json()["response_type"] == "explanation"
    assert r_none.json()["referenced_assessment_id"] is None


def test_assistant_checkin_guidance_and_all_knowledge_base_topics() -> None:
    client = create_eval_client(assistant_enabled=True)

    # Check-in prompt routing
    r_ci = client.post(
        "/internal/v1/assistant/respond",
        json={
            "request_id": "req-ci-prompt",
            "conversation_id": "conv-ci-prompt",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "assistant_conversations",
                "consent_version": "v1",
            },
            "user_message": "How do I start a wellbeing check-in today?",
        },
        headers=internal_auth_headers("req-ci-prompt"),
    )
    assert r_ci.status_code == 200
    assert r_ci.json()["response_type"] == "check_in_prompt"
    assert r_ci.json()["suggested_actions"] == ["complete_check_in"]

    # Curated knowledge base routing across all 8 topics
    assert len(PREVENTIVE_KNOWLEDGE_BASE) == 8
    for snippet in PREVENTIVE_KNOWLEDGE_BASE:
        r_kb = client.post(
            "/internal/v1/assistant/respond",
            json={
                "request_id": f"req-kb-{snippet.topic_code}",
                "conversation_id": f"conv-kb-{snippet.topic_code}",
                "authorization_context": {
                    "consent_verified": True,
                    "consent_purpose_code": "assistant_conversations",
                    "consent_version": "v1",
                },
                "user_message": f"Can you share preventive guidance on {snippet.keywords[0]}?",
            },
            headers=internal_auth_headers(f"req-kb-{snippet.topic_code}"),
        )
        assert r_kb.status_code == 200
        body = r_kb.json()
        assert body["response_type"] == "preventive_guidance"
        assert KNOWLEDGE_BASE_VERSION in body["message_text"]


def test_assistant_graceful_degradation_when_adapter_unavailable_still_runs_crisis_screener() -> (
    None
):
    client = create_eval_client(
        assistant_enabled=True,
        assistant_adapter=_FailingAssistantAdapter(),
    )

    # Benign turn returns response_type="unavailable" cleanly
    r_benign = client.post(
        "/internal/v1/assistant/respond",
        json={
            "request_id": "req-fail-benign",
            "conversation_id": "conv-fail-benign",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "assistant_conversations",
                "consent_version": "v1",
            },
            "user_message": "What are tips for eating more vegetables?",
        },
        headers=internal_auth_headers("req-fail-benign"),
    )
    assert r_benign.status_code == 200
    assert r_benign.json()["response_type"] == "unavailable"
    assert r_benign.json()["message_text"] == ASSISTANT_UNAVAILABLE_MESSAGE

    # Crisis turn STILL escalates deterministically even when adapter is offline!
    r_crisis = client.post(
        "/internal/v1/assistant/respond",
        json={
            "request_id": "req-fail-crisis",
            "conversation_id": "conv-fail-crisis",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "assistant_conversations",
                "consent_version": "v1",
            },
            "user_message": "I cannot breathe and have severe chest pain.",
        },
        headers=internal_auth_headers("req-fail-crisis"),
    )
    assert r_crisis.status_code == 200
    assert r_crisis.json()["response_type"] == "escalation"
    assert r_crisis.json()["safety_metadata"]["escalation_required"] is True


@pytest.mark.parametrize(
    ("responses_payload", "expected_status"),
    [
        ({"stress_frequency_score": 1, "exhaustion_score": 1, "sleep_quality_score": 0}, "normal"),
        (
            [
                {"question_code": "stress_frequency_score", "value": 3},
                {"question_code": "exhaustion_score", "response": 3},
            ],
            "needs_review",
        ),
        ({"stress_frequency_score": 4}, "needs_review"),
    ],
)
def test_checkin_evaluate_safety_normal_and_needs_review_paths(
    responses_payload: object,
    expected_status: str,
) -> None:
    client = create_eval_client(checkin_safety_enabled=True)
    resp = client.post(
        "/internal/v1/check-ins/evaluate-safety",
        json={
            "request_id": "req-ci-status",
            "questionnaire_version": "checkin-v1.0.0",
            "completed_at": "2026-11-25T10:00:00Z",
            "authorization_context": {
                "consent_verified": True,
                "consent_purpose_code": "wellbeing_check_ins",
                "consent_version": "v1",
            },
            "responses": responses_payload,
        },
        headers=internal_auth_headers("req-ci-status"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["safety_status"] == expected_status
    assert body["escalation_required"] is False
