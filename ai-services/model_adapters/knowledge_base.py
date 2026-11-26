"""Curated, version-pinned preventive-health guidance knowledge base (kb-v1.0.0)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final

from app.contracts.common import SuggestedActionCode
from app.safety.crisis_screener import normalize_for_matching

KNOWLEDGE_BASE_VERSION: Final[str] = "kb-v1.0.0"


@dataclass(frozen=True, slots=True)
class KnowledgeSnippet:
    """Reviewed, non-diagnostic public-health guidance snippet (WHO / RBC aligned)."""

    topic_code: str
    title: str
    keywords: tuple[str, ...]
    guidance_text: str
    guideline_source: str
    suggested_actions: tuple[SuggestedActionCode, ...]


PREVENTIVE_KNOWLEDGE_BASE: Final[tuple[KnowledgeSnippet, ...]] = (
    KnowledgeSnippet(
        topic_code="physical_activity",
        title="Weekly physical activity and everyday movement",
        keywords=(
            "physical activity",
            "exercise",
            "walk",
            "walking",
            "sedentary",
            "sitting",
            "workout",
            "movement",
            "active",
            "fitness",
            "cardio",
            "150 minutes",
        ),
        guidance_text=(
            "For general adult preventive health, public-health guidelines recommend aiming for "
            "at least 150 minutes of moderate-intensity movement across the week (such as brisk "
            "walking, cycling, gardening, or active household chores) and breaking up long "
            "periods of sitting. If you are building up from low activity, gradual increases at "
            "a comfortable pace help support sustainable habits. If you have existing medical "
            "concerns or feel unwell during exertion, consult a qualified healthcare professional."
        ),
        guideline_source=(
            "WHO Guidelines on Physical Activity and Sedentary Behaviour & Rwanda Biomedical "
            "Centre (RBC) NCD Preventive Lifestyle Guidance"
        ),
        suggested_actions=("view_risk_detail",),
    ),
    KnowledgeSnippet(
        topic_code="heart_healthy_nutrition",
        title="Balanced heart-healthy everyday nutrition",
        keywords=(
            "diet",
            "nutrition",
            "food",
            "fruit",
            "fruits",
            "vegetable",
            "vegetables",
            "salt",
            "sodium",
            "sugar",
            "eating",
            "meal",
            "healthy eating",
            "servings",
        ),
        guidance_text=(
            "Preventive nutrition guidance encourages eating a variety of vegetables, fruits, "
            "legumes, and whole grains each day (aiming toward five or more daily servings of "
            "fruits and vegetables where accessible), choosing clean water over sugary drinks, "
            "and moderating added salt and heavily processed fats to support long-term metabolic "
            "and cardiovascular wellbeing. Individual dietary needs vary, so speak with a "
            "qualified healthcare provider for tailored nutritional advice."
        ),
        guideline_source=(
            "WHO Healthy Diet Preventive Guidance & Rwanda Biomedical Centre (RBC) NCD "
            "Prevention Recommendations"
        ),
        suggested_actions=("view_risk_detail",),
    ),
    KnowledgeSnippet(
        topic_code="tobacco_cessation",
        title="Tobacco avoidance and cessation support",
        keywords=(
            "tobacco",
            "smoking",
            "smoke cigarettes",
            "cigarette",
            "cigarettes",
            "nicotine",
            "vape",
            "vaping",
            "shisha",
            "quit smoking",
            "secondhand smoke",
        ),
        guidance_text=(
            "Avoiding all forms of tobacco and secondhand smoke is one of the most impactful "
            "preventive steps for cardiovascular and respiratory wellbeing. Benefits begin soon "
            "after stopping and continue to build over time. Setting a practical quit plan, "
            "identifying daily triggers, and seeking structured cessation support from a "
            "qualified healthcare professional or verified health facility can improve success."
        ),
        guideline_source=(
            "WHO Tobacco Cessation Preventive Guidance & Rwanda Biomedical Centre (RBC) NCD "
            "Prevention Guidance"
        ),
        suggested_actions=("view_risk_detail", "view_facilities"),
    ),
    KnowledgeSnippet(
        topic_code="sleep_hygiene",
        title="Restorative sleep habits",
        keywords=(
            "sleep",
            "sleeping",
            "insomnia",
            "bedtime",
            "rested",
            "wake up tired",
            "sleep hygiene",
            "hours of sleep",
            "night rest",
        ),
        guidance_text=(
            "Consistent, restorative sleep (commonly around 7 to 9 hours per night for most "
            "adults, within a general 6 to 10 hour preventive window) supports physical recovery "
            "and emotional resilience. Helpful preventive habits include keeping regular sleep "
            "and wake times, limiting caffeine late in the day, keeping sleeping areas quiet and "
            "ventilated, and reducing bright screen use shortly before bed. Persistent sleep "
            "difficulties should be discussed with a qualified healthcare professional."
        ),
        guideline_source="WHO & Rwanda Biomedical Centre (RBC) Preventive Lifestyle Guidance",
        suggested_actions=("complete_check_in",),
    ),
    KnowledgeSnippet(
        topic_code="malaria_prevention",
        title="Household mosquito and malaria exposure prevention",
        keywords=(
            "malaria",
            "mosquito",
            "mosquitoes",
            "bed net",
            "bednet",
            "itn",
            "treated net",
            "standing water",
            "stagnant water",
            "vector",
        ),
        guidance_text=(
            "Preventive malaria vector protection includes sleeping under an intact "
            "insecticide-treated mosquito net every night, keeping window and door screens "
            "closed around dusk and dawn, and draining or covering containers of standing water "
            "around the home where mosquitoes breed. Preventive habits lower exposure but cannot "
            "rule out infection: anyone who develops a fever should promptly visit a verified "
            "healthcare facility or community health worker for proper testing."
        ),
        guideline_source=(
            "WHO Guidelines for Malaria Vector Control & Rwanda Biomedical Centre (RBC) Malaria "
            "Prevention Guidance"
        ),
        suggested_actions=("view_facilities",),
    ),
    KnowledgeSnippet(
        topic_code="water_and_hygiene",
        title="Safe drinking water and handwashing hygiene",
        keywords=(
            "water",
            "drinking water",
            "boil water",
            "clean water",
            "handwashing",
            "wash hands",
            "hygiene",
            "sanitation",
            "soap",
            "waterborne",
            "cholera prevention",
        ),
        guidance_text=(
            "Safe water and hygiene habits reduce exposure to waterborne illnesses, especially "
            "during heavy rainfall. Recommended practices include drinking boiled, properly "
            "filtered, or verified safe water, storing treated water in clean covered containers, "
            "washing raw produce with safe water, and washing hands thoroughly with soap and "
            "water before handling food and after using sanitation facilities. Seek timely care "
            "at a verified healthcare facility if diarrhea or dehydration develops."
        ),
        guideline_source=(
            "WHO Household Water Treatment Guidance & Rwanda Biomedical Centre (RBC) WASH "
            "Preventive Guidance"
        ),
        suggested_actions=("view_facilities",),
    ),
    KnowledgeSnippet(
        topic_code="air_quality_protection",
        title="Air quality and indoor smoke protection",
        keywords=(
            "air quality",
            "air pollution",
            "pm2.5",
            "pm25",
            "smog",
            "dust",
            "cooking smoke",
            "indoor smoke",
            "charcoal",
            "firewood",
            "ventilation",
        ),
        guidance_text=(
            "To reduce preventive respiratory exposure when regional particulate pollution "
            "(PM2.5) or dust is elevated, consider moderating heavy outdoor exertion during peak "
            "haze or traffic hours and choosing cleaner times of day for outdoor activity. At "
            "home, opening windows or eaves to ventilate cooking areas and using cleaner fuels "
            "where available helps lower indoor smoke exposure. Consult a healthcare provider if "
            "you experience persistent cough or breathing discomfort."
        ),
        guideline_source=(
            "WHO Global Air Quality Guidelines & Household Air Pollution Preventive Guidance"
        ),
        suggested_actions=("view_risk_detail",),
    ),
    KnowledgeSnippet(
        topic_code="stress_and_rest_reflection",
        title="Daily stress pacing, rest, and wellbeing reflection",
        keywords=(
            "stress",
            "stressed",
            "overwhelmed",
            "burnout",
            "exhausted",
            "exhaustion",
            "relax",
            "calm",
            "wellbeing",
            "wellness",
            "tension",
            "worry",
        ),
        guidance_text=(
            "When everyday demands feel heavy, small preventive routines can support recovery: "
            "taking brief slow-breathing pauses, protecting regular rest and meal times, "
            "pacing tasks into manageable steps, spending a few minutes in gentle movement, and "
            "staying connected with trusted people in your community. You can also complete a "
            "structured wellbeing check-in in Albo or connect with a qualified healthcare "
            "professional if stress or exhaustion feels persistent."
        ),
        guideline_source=(
            "WHO Preventive Stress Management Guidance & Rwanda Biomedical Centre (RBC) "
            "Community Mental Wellbeing Guidance"
        ),
        suggested_actions=("complete_check_in", "view_facilities"),
    ),
)

GENERAL_PREVENTIVE_FALLBACK_SNIPPET: Final[KnowledgeSnippet] = KnowledgeSnippet(
    topic_code="general_preventive_overview",
    title="General preventive health and lifestyle support",
    keywords=(),
    guidance_text=(
        "I can share non-diagnostic preventive guidance grounded in public-health "
        "recommendations across everyday physical activity, balanced nutrition, tobacco "
        "avoidance, restorative sleep, mosquito prevention, safe water and handwashing, air "
        "quality protection, and daily stress pacing. I can also explain your authorized Albo "
        "preventive risk indicators or help you navigate to verified healthcare facilities."
    ),
    guideline_source="WHO & Rwanda Biomedical Centre (RBC) Preventive Health Overview",
    suggested_actions=("view_risk_detail", "complete_check_in", "view_facilities"),
)

_BY_TOPIC_CODE: Final[dict[str, KnowledgeSnippet]] = {
    snippet.topic_code: snippet for snippet in PREVENTIVE_KNOWLEDGE_BASE
}


def match_knowledge_snippet(
    user_message: str,
    topic_hint: str | None = None,
) -> KnowledgeSnippet:
    """Deterministically select the best-matching curated knowledge snippet."""
    if topic_hint:
        norm_hint = normalize_for_matching(topic_hint).replace(" ", "_")
        if norm_hint in _BY_TOPIC_CODE:
            return _BY_TOPIC_CODE[norm_hint]
        for snippet in PREVENTIVE_KNOWLEDGE_BASE:
            if norm_hint in snippet.topic_code or any(
                norm_hint.replace("_", " ") in kw for kw in snippet.keywords
            ):
                return snippet

    normalized_msg = normalize_for_matching(user_message)
    best_snippet: KnowledgeSnippet | None = None
    best_score = 0

    for snippet in PREVENTIVE_KNOWLEDGE_BASE:
        score = 0
        for kw in snippet.keywords:
            pattern = re.compile(rf"\b{re.escape(kw)}\b")
            if pattern.search(normalized_msg):
                score += 2 if " " in kw else 1
        if score > best_score:
            best_score = score
            best_snippet = snippet

    return best_snippet if best_snippet is not None else GENERAL_PREVENTIVE_FALLBACK_SNIPPET
