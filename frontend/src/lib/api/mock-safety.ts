/**
 * MOCK-ONLY deterministic safety screening, mirroring the backend contract
 * (AI_ASSISTANT §4, §7; FR-023, FR-024). In live mode the backend and
 * ai-services make every safety decision; the client only renders the result.
 *
 * Conservative by design: a plausible crisis signal always escalates.
 * Contact references are synthetic placeholders (OPEN-006) — never real numbers.
 */
import type { CheckInResponses, CrisisEscalationCard, Facility } from "./types";

export type ScreenResult =
  | { kind: "escalation"; category: CrisisEscalationCard["category"] }
  | { kind: "refusal"; reason: "diagnosis" | "prescription" | "other_person" | "injection" }
  | { kind: "safe" };

const SELF_HARM = /\b(kill myself|suicid\w*|end (my|it all)|self[- ]?harm|hurt myself|don'?t want to (live|be alive)|no reason to live)\b/i;
const ACUTE = /\b(chest pain|can'?t breathe|cannot breathe|difficulty breathing|unconscious|passed out|seizure|severe bleeding|stroke|overdose)\b/i;
const DIAGNOSIS = /\b(do i have|diagnos\w*|is it cancer|what disease|confirm (that )?i have|lab results?|interpret my)\b/i;
const PRESCRIPTION = /\b(prescri\w*|dosage|dose|how many (pills|tablets|mg)|which (medicine|medication|drug)|antibiotic)\b/i;
const OTHER_PERSON = /\b(another (user|person|patient)'?s?|someone else'?s|my (neighbou?r|friend|wife|husband)'?s (record|data|results))\b/i;
const INJECTION = /\b(ignore (all|previous|your) (instructions|rules)|system prompt|you are now|developer mode)\b/i;

export function screenMessage(text: string): ScreenResult {
  if (SELF_HARM.test(text)) return { kind: "escalation", category: "mental_health_crisis" };
  if (ACUTE.test(text)) return { kind: "escalation", category: "acute_medical_emergency" };
  if (INJECTION.test(text)) return { kind: "refusal", reason: "injection" };
  if (OTHER_PERSON.test(text)) return { kind: "refusal", reason: "other_person" };
  if (PRESCRIPTION.test(text)) return { kind: "refusal", reason: "prescription" };
  if (DIAGNOSIS.test(text)) return { kind: "refusal", reason: "diagnosis" };
  return { kind: "safe" };
}

export function screenCheckIn(r: CheckInResponses): {
  safety_status: "routine" | "elevated" | "escalated";
  escalation: CrisisEscalationCard["category"] | null;
} {
  if (r.self_harm_signal === 1) return { safety_status: "escalated", escalation: "mental_health_crisis" };
  const strain = r.stress_frequency_score + r.exhaustion_score + (4 - r.sleep_quality_score);
  if (strain >= 7) return { safety_status: "elevated", escalation: null };
  return { safety_status: "routine", escalation: null };
}

const CONTACTS: Record<CrisisEscalationCard["category"], CrisisEscalationCard["emergency_contacts"]> = {
  mental_health_crisis: [
    {
      code: "mental_health_support_placeholder",
      label: "Mental health crisis support line",
      contact_reference: "SYNTHETIC-HELPLINE · verify before production",
      synthetic_verify_before_production: true,
    },
    {
      code: "emergency_medical_placeholder",
      label: "Emergency medical / ambulance",
      contact_reference: "SYNTHETIC-EMERGENCY · verify before production",
      synthetic_verify_before_production: true,
    },
  ],
  acute_medical_emergency: [
    {
      code: "emergency_medical_placeholder",
      label: "Emergency medical / ambulance",
      contact_reference: "SYNTHETIC-EMERGENCY · verify before production",
      synthetic_verify_before_production: true,
    },
  ],
};

export function buildCrisisCard(category: CrisisEscalationCard["category"], facilities: Facility[]): CrisisEscalationCard {
  const mental = category === "mental_health_crisis";
  return {
    category,
    headline: mental ? "You don't have to face this alone" : "This may need urgent care",
    message: mental
      ? "It sounds like you may be going through something very difficult. Please reach out to someone now: a crisis line, emergency services, or a person you trust. If you are in immediate danger, contact emergency services."
      : "The symptoms you mentioned can be serious. Please contact emergency services or go to the nearest health facility now. Don't wait for an online answer.",
    governance_notice:
      "Albo is not an emergency service. Contact details shown here are development placeholders pending clinical approval (OPEN-006).",
    emergency_contacts: CONTACTS[category],
    verified_facilities: facilities
      .filter((f) => f.services.some((s) => /emergency|general|mental/i.test(s)) || /hospital|health centre/i.test(f.type))
      .slice(0, 2),
  };
}
