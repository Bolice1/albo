import type { AiEscalationCategory } from '@integrations/ai-service/ai-service.client';
import type { FacilityView } from '@modules/facilities-care/facilities-care.service';

export interface EmergencyContactEntry {
  readonly code: string;
  readonly label: string;
  readonly contact_reference: string;
  readonly synthetic_verify_before_production: true;
}

export interface CrisisEscalationCard {
  readonly category: AiEscalationCategory;
  readonly guidance_key: string;
  readonly headline: string;
  readonly message: string;
  readonly governance_notice: string;
  readonly emergency_contacts: EmergencyContactEntry[];
  readonly verified_facilities: FacilityView[];
}

/**
 * Synthetic-flagged emergency contact placeholder catalog (FR-024, HAZ-04, OPEN-006).
 * Numbers are explicitly marked `synthetic_verify_before_production: true` until
 * clinical/public-health leadership signs off on the verified Rwanda contact directory.
 */
const SYNTHETIC_RWANDA_ESCALATION_CONTACTS: Readonly<
  Record<AiEscalationCategory, readonly EmergencyContactEntry[]>
> = {
  mental_health_crisis: [
    {
      code: 'rwanda_mental_health_support_placeholder',
      label: 'Rwanda Mental Health Crisis Support Line (Verify Before Production — OPEN-006)',
      contact_reference: 'SYNTHETIC-HELPLINE-114-VERIFY-OPEN-006',
      synthetic_verify_before_production: true,
    },
    {
      code: 'rwanda_emergency_medical_placeholder',
      label:
        'National Emergency Medical / Ambulance Dispatch (Verify Before Production — OPEN-006)',
      contact_reference: 'SYNTHETIC-EMERGENCY-912-VERIFY-OPEN-006',
      synthetic_verify_before_production: true,
    },
  ],
  acute_medical_emergency: [
    {
      code: 'rwanda_emergency_medical_placeholder',
      label:
        'National Emergency Medical / Ambulance Dispatch (Verify Before Production — OPEN-006)',
      contact_reference: 'SYNTHETIC-EMERGENCY-912-VERIFY-OPEN-006',
      synthetic_verify_before_production: true,
    },
  ],
};

/**
 * Builds a deterministic, human-authored escalation card injected with verified
 * PostgreSQL facility cards (FR-024, ADR-006, AI_SAFETY.md §4.1).
 */
export function buildDeterministicCrisisEscalationCard(
  category: AiEscalationCategory | null | undefined,
  verifiedFacilities: FacilityView[],
  guidanceKey?: string | null,
): CrisisEscalationCard {
  const effectiveCategory: AiEscalationCategory = category ?? 'acute_medical_emergency';

  if (effectiveCategory === 'mental_health_crisis') {
    return {
      category: 'mental_health_crisis',
      guidance_key: guidanceKey ?? 'escalation.mental_health_crisis.v1',
      headline: 'Immediate Human & Crisis Support Recommended',
      message:
        'You do not have to carry this alone. Albo is an automated preventive tool and cannot provide crisis counseling or emergency care. Please reach out right now to a trusted person, a qualified mental-health professional, or the nearest emergency health facility.',
      governance_notice:
        'Emergency contact numbers require clinical and operational verification before live citizen launch (OPEN-006). Facility listings below come from the verified Albo directory.',
      emergency_contacts: [...SYNTHETIC_RWANDA_ESCALATION_CONTACTS.mental_health_crisis],
      verified_facilities: verifiedFacilities,
    };
  }

  return {
    category: 'acute_medical_emergency',
    guidance_key: guidanceKey ?? 'escalation.acute_medical_emergency.v1',
    headline: 'Seek Urgent In-Person Medical Evaluation Immediately',
    message:
      'Your input includes signs that may require urgent in-person clinical evaluation. Albo cannot diagnose emergencies or provide urgent medical care. Please contact emergency medical services or go to the nearest hospital or emergency health facility right away.',
    governance_notice:
      'Emergency contact numbers require clinical and operational verification before live citizen launch (OPEN-006). Facility listings below come from the verified Albo directory.',
    emergency_contacts: [...SYNTHETIC_RWANDA_ESCALATION_CONTACTS.acute_medical_emergency],
    verified_facilities: verifiedFacilities,
  };
}
