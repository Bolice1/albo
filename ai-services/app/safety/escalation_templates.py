"""Reviewed, non-diagnostic safety disclaimers, refusal templates, and crisis escalation copy."""

from __future__ import annotations

from typing import Final

# Mandatory HAZ-01 low-level caveat (exact text from AI_SAFETY.md §3 HAZ-01)
LOW_RISK_CAVEAT_STATEMENT: Final[str] = (
    "This reflects only the tracked preventive factors and does not rule out illness. "
    "Seek medical care if you feel unwell."
)

ASSISTANT_NON_DIAGNOSTIC_DISCLAIMER: Final[str] = (
    "Albo Assistant is an AI preventive-health support tool, not a doctor, therapist, "
    "diagnostic instrument, or emergency service. Information shared here does not "
    "constitute a medical diagnosis or treatment plan."
)

CHECKIN_NON_DIAGNOSTIC_DISCLAIMER: Final[str] = (
    "This wellbeing check-in supports personal preventive reflection and safety screening. "
    "It is not a clinical assessment or mental-health diagnosis."
)

MENTAL_HEALTH_CRISIS_MESSAGE: Final[str] = (
    "I am an AI preventive-health support tool and cannot provide crisis counseling, "
    "but your safety matters right now. Please seek immediate human support by using "
    "the verified emergency and mental-health support contacts displayed by Albo, "
    "visiting the nearest verified healthcare facility, or reaching out to a trusted "
    "family member, friend, or healthcare professional immediately."
)

ACUTE_MEDICAL_EMERGENCY_MESSAGE: Final[str] = (
    "The symptoms you described may require urgent medical evaluation. As an AI "
    "preventive-health support tool, I cannot assess emergencies. Please seek immediate "
    "in-person emergency medical care using the verified emergency contacts and nearby "
    "emergency healthcare facilities provided by Albo."
)

PROHIBITED_CLINICAL_REFUSAL_MESSAGE: Final[str] = (
    "I am an AI preventive-health support tool and cannot diagnose conditions, interpret "
    "clinical test results, prescribe or recommend medication dosages, or advise stopping "
    "prescribed treatments. Please consult a qualified healthcare provider or pharmacist "
    "for clinical assessment and medication guidance. I can help you review general "
    "preventive lifestyle habits or find verified healthcare facilities."
)

PROMPT_INJECTION_REFUSAL_MESSAGE: Final[str] = (
    "I can only assist with general preventive-health awareness, explaining your own "
    "authorized Albo risk indicators, and guiding you toward verified healthcare "
    "resources within Albo's safety boundaries. I cannot assume clinical roles, bypass "
    "safety rules, disclose internal system instructions, or access another person's data."
)

POST_FILTER_SAFE_FALLBACK_MESSAGE: Final[str] = (
    "I am an AI preventive-health support tool and can share only general, non-diagnostic "
    "preventive information and help you review your authorized Albo indicators. For "
    "medical questions, treatment decisions, or verified facility contact details, please "
    "use Albo's verified facility directory or consult a qualified healthcare professional."
)

ASSISTANT_UNAVAILABLE_MESSAGE: Final[str] = (
    "The preventive-health assistant is currently unavailable in this environment. "
    "You can continue to view your preventive risk indicators and search verified "
    "healthcare facilities directly in Albo. If you feel unwell or need urgent care, "
    "please contact emergency support or visit a healthcare facility."
)
