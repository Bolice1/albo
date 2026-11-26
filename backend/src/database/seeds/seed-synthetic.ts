import {
  ClinicalReviewStatus,
  ConsentPurposeStatus,
  DataSourceType,
  FacilityStatus,
  FacilityType,
  ImplementationType,
  PrismaClient,
  RoleCode,
  UseCaseStatus,
} from '@prisma/client';
import { assertNonProduction } from '@common/utils/environment.util';

const SYNTHETIC_ROLES: ReadonlyArray<{ code: RoleCode; description: string }> = [
  {
    code: RoleCode.citizen,
    description:
      'Adult citizen managing personal preventive-health profile, consents, and indicators',
  },
  {
    code: RoleCode.provider,
    description:
      'Authorized healthcare professional viewing scoped records of assigned citizens with consent',
  },
  {
    code: RoleCode.facility_user,
    description:
      'Authorized healthcare facility or pharmacy representative managing approved facility workflows',
  },
  {
    code: RoleCode.community_health_worker,
    description:
      'Approved community health worker supporting assigned citizens within consented scope',
  },
  {
    code: RoleCode.platform_admin,
    description:
      'Platform operator managing configuration and account status without automatic health-record access',
  },
];

const SYNTHETIC_CONSENT_PURPOSES_V1: ReadonlyArray<{
  code: string;
  version: string;
  title: string;
  description: string;
  dataCategories: string[];
  isRequiredForOnboarding: boolean;
}> = [
  {
    code: 'health_input_storage',
    version: 'v1',
    title: 'Store self-reported lifestyle and health inputs',
    description:
      'Allows Albo to store your approved self-reported lifestyle and preventive health inputs (synthetic baseline wording).',
    dataCategories: ['lifestyle', 'activity', 'diet', 'sleep', 'health_history'],
    isRequiredForOnboarding: false,
  },
  {
    code: 'preventive_risk_calculation',
    version: 'v1',
    title: 'Calculate non-diagnostic preventive risk indicators',
    description:
      'Allows Albo to evaluate your consented inputs using approved deterministic rules to generate non-diagnostic preventive risk indicators.',
    dataCategories: ['lifestyle', 'activity', 'diet', 'sleep', 'derived_risk_indicators'],
    isRequiredForOnboarding: false,
  },
  {
    code: 'wellbeing_check_ins',
    version: 'v1',
    title: 'Store and safety-screen wellbeing check-ins',
    description:
      'Allows Albo to store structured wellbeing check-in responses and run deterministic safety screening.',
    dataCategories: ['wellbeing_check_ins'],
    isRequiredForOnboarding: false,
  },
  {
    code: 'environmental_context',
    version: 'v1',
    title: 'Use area-level location for environmental context',
    description:
      'Allows Albo to link your administrative area with regional weather and air-quality observations.',
    dataCategories: ['area_location', 'environmental_observations'],
    isRequiredForOnboarding: false,
  },
  {
    code: 'facility_location_search',
    version: 'v1',
    title: 'Search nearby healthcare facilities',
    description:
      'Allows Albo to use bounded search coordinates to locate nearby verified healthcare facilities.',
    dataCategories: ['bounded_search_location'],
    isRequiredForOnboarding: false,
  },
  {
    code: 'provider_data_sharing',
    version: 'v1',
    title: 'Share permitted preventive data with assigned providers',
    description:
      'Allows an actively assigned healthcare provider or community health worker to view scoped preventive records.',
    dataCategories: ['lifestyle', 'derived_risk_indicators', 'provider_follow_ups'],
    isRequiredForOnboarding: false,
  },
  {
    code: 'notifications_delivery',
    version: 'v1',
    title: 'Receive preventive reminders and notifications',
    description:
      'Allows Albo to deliver opt-in preventive reminders and status notifications via your selected channels.',
    dataCategories: ['notification_preferences'],
    isRequiredForOnboarding: false,
  },
  {
    code: 'report_generation',
    version: 'v1',
    title: 'Generate personal preventive health summary reports',
    description:
      'Allows Albo to compile your consented records into downloadable personal summary reports.',
    dataCategories: ['lifestyle', 'derived_risk_indicators', 'reports'],
    isRequiredForOnboarding: false,
  },
  {
    code: 'assistant_conversations',
    version: 'v1',
    title: 'Use the safety-gated preventive health assistant',
    description:
      'Allows Albo to process bounded preventive health questions and explanations through the safety-screened assistant.',
    dataCategories: ['assistant_conversations', 'derived_risk_indicators'],
    isRequiredForOnboarding: false,
  },
];

const SYNTHETIC_RISK_USE_CASES: ReadonlyArray<{
  code: string;
  name: string;
  description: string;
  intendedUse: string;
  excludedUse: string;
  requiredInputCategories: string[];
  status: UseCaseStatus;
  clinicalReviewStatus: ClinicalReviewStatus;
  ruleVersion: {
    version: string;
    implementationType: ImplementationType;
    configurationReference: string;
    effectiveFrom: Date | null;
    approvalStatus: ClinicalReviewStatus;
    limitations: string[];
    evaluationReference: string;
  };
}> = [
  {
    code: 'lifestyle_ncd_preventive',
    name: 'Preventive lifestyle and NCD risk-factor awareness indicator',
    description:
      'Deterministic weighted lifestyle indicator summarizing modifiable physical activity, tobacco, sleep, and nutrition habits.',
    intendedUse:
      'Personal preventive awareness and lifestyle reflection for authenticated adult citizens (18+) in Rwanda.',
    excludedUse:
      'Never for clinical diagnosis, 10-year event probability, medication prescribing, emergency triage, or denial of care.',
    requiredInputCategories: ['activity', 'lifestyle'],
    status: UseCaseStatus.approved,
    clinicalReviewStatus: ClinicalReviewStatus.under_review,
    ruleVersion: {
      version: 'rules-v1.0.0',
      implementationType: ImplementationType.weighted_score,
      configurationReference: 'ai-services/risk_engine/rules/lifestyle_ncd_v1_0_0.py',
      effectiveFrom: new Date('2026-11-19T00:00:00.000Z'),
      approvalStatus: ClinicalReviewStatus.under_review,
      limitations: [
        'This is a preventive risk indicator based on self-reported lifestyle information, not a medical diagnosis.',
        'Inputs were self-reported by the citizen and were not independently verified by a clinical measurement.',
      ],
      evaluationReference: 'docs/04-artificial-intelligence/MODEL_DOCUMENTATION.md#61',
    },
  },
  {
    code: 'malaria_exposure_preventive',
    name: 'Preventive malaria environmental and habit exposure indicator (Draft)',
    description:
      'Draft weighted exposure rubric combining regional rainfall/temperature context with preventive habits.',
    intendedUse: 'Preventive vector-exposure awareness (synthetic draft only).',
    excludedUse: 'Never a malaria diagnosis or substitute for parasitological testing.',
    requiredInputCategories: ['environmental_exposure', 'lifestyle'],
    status: UseCaseStatus.draft,
    clinicalReviewStatus: ClinicalReviewStatus.draft,
    ruleVersion: {
      version: 'rules-v0.1.0-draft',
      implementationType: ImplementationType.weighted_score,
      configurationReference: 'ai-services/risk_engine/rules/malaria_exposure_v0_1_0.py',
      effectiveFrom: null,
      approvalStatus: ClinicalReviewStatus.draft,
      limitations: [
        'Draft synthetic exposure indicator; not clinically approved for production use.',
      ],
      evaluationReference: 'docs/04-artificial-intelligence/MODEL_DOCUMENTATION.md#6',
    },
  },
  {
    code: 'respiratory_air_quality_preventive',
    name: 'Preventive respiratory and air-quality exposure indicator (Draft)',
    description:
      'Draft weighted exposure rubric combining regional air-quality observations with smoke/outdoor exposure habits.',
    intendedUse: 'Preventive air-quality exposure awareness (synthetic draft only).',
    excludedUse: 'Never a diagnosis of asthma, COPD, or acute respiratory infection.',
    requiredInputCategories: ['environmental_exposure', 'lifestyle'],
    status: UseCaseStatus.draft,
    clinicalReviewStatus: ClinicalReviewStatus.draft,
    ruleVersion: {
      version: 'rules-v0.1.0-draft',
      implementationType: ImplementationType.weighted_score,
      configurationReference: 'ai-services/risk_engine/rules/respiratory_air_quality_v0_1_0.py',
      effectiveFrom: null,
      approvalStatus: ClinicalReviewStatus.draft,
      limitations: [
        'Draft synthetic air-quality indicator; not clinically approved for production use.',
      ],
      evaluationReference: 'docs/04-artificial-intelligence/MODEL_DOCUMENTATION.md#6',
    },
  },
  {
    code: 'water_hygiene_preventive',
    name: 'Preventive water safety and hygiene exposure indicator (Draft)',
    description:
      'Draft deterministic rule set for preventive waterborne and hygiene exposure awareness.',
    intendedUse: 'Preventive water-safety and hygiene awareness (synthetic draft only).',
    excludedUse: 'Never a diagnosis of cholera or acute gastrointestinal illness.',
    requiredInputCategories: ['environmental_exposure', 'lifestyle'],
    status: UseCaseStatus.draft,
    clinicalReviewStatus: ClinicalReviewStatus.draft,
    ruleVersion: {
      version: 'rules-v0.1.0-draft',
      implementationType: ImplementationType.rule,
      configurationReference: 'ai-services/risk_engine/rules/water_hygiene_v0_1_0.py',
      effectiveFrom: null,
      approvalStatus: ClinicalReviewStatus.draft,
      limitations: [
        'Draft synthetic water/hygiene indicator; not clinically approved for production use.',
      ],
      evaluationReference: 'docs/04-artificial-intelligence/MODEL_DOCUMENTATION.md#6',
    },
  },
  {
    code: 'wellbeing_checkin_screener',
    name: 'Structured wellbeing check-in safety and stress screener (Draft)',
    description:
      'Deterministic safety and stress-pattern screener for structured wellbeing check-ins.',
    intendedUse: 'Safety-gated check-in reflection and crisis escalation routing.',
    excludedUse: 'Never a psychiatric or psychological diagnosis.',
    requiredInputCategories: ['lifestyle'],
    status: UseCaseStatus.draft,
    clinicalReviewStatus: ClinicalReviewStatus.draft,
    ruleVersion: {
      version: 'rules-v0.1.0-draft',
      implementationType: ImplementationType.rule,
      configurationReference: 'ai-services/risk_engine/rules/wellbeing_checkin_v0_1_0.py',
      effectiveFrom: null,
      approvalStatus: ClinicalReviewStatus.draft,
      limitations: ['Deterministic wellbeing check-in screener; not a mental-health diagnosis.'],
      evaluationReference: 'docs/04-artificial-intelligence/MODEL_DOCUMENTATION.md#6',
    },
  },
];

const SYNTHETIC_DATA_SOURCES: ReadonlyArray<{
  code: string;
  name: string;
  sourceType: DataSourceType;
  owner: string;
  purpose: string;
  trustStatus: string;
  isCalculationApproved: boolean;
  termsReference: string;
}> = [
  {
    code: 'rwanda_synthetic_facility_registry',
    name: 'Albo Synthetic Rwanda Healthcare Facility Directory',
    sourceType: DataSourceType.verified_facility_registry,
    owner: 'Albo Engineering Sandbox (Synthetic)',
    purpose: 'Synthetic facility discovery, directions, and referral testing across Rwanda',
    trustStatus: 'verified_synthetic',
    isCalculationApproved: false,
    termsReference: 'SYNTHETIC-ONLY-DP-005',
  },
  {
    code: 'rwanda_synthetic_meteo_sandbox',
    name: 'Albo Synthetic Rwanda Meteorological Sandbox Feed',
    sourceType: DataSourceType.verified_environmental_adapter,
    owner: 'Albo Engineering Sandbox (Synthetic)',
    purpose: 'Area-level synthetic temperature, humidity, and rainfall observations',
    trustStatus: 'verified_synthetic',
    isCalculationApproved: true,
    termsReference: 'SYNTHETIC-ONLY-DP-005',
  },
  {
    code: 'rwanda_synthetic_air_quality_sandbox',
    name: 'Albo Synthetic Rwanda Air Quality Sandbox Feed',
    sourceType: DataSourceType.verified_environmental_adapter,
    owner: 'Albo Engineering Sandbox (Synthetic)',
    purpose: 'Area-level synthetic PM2.5 and AQI environmental context observations',
    trustStatus: 'verified_synthetic',
    isCalculationApproved: true,
    termsReference: 'SYNTHETIC-ONLY-DP-005',
  },
];

const SYNTHETIC_FACILITIES: ReadonlyArray<{
  sourceReference: string;
  name: string;
  facilityType: FacilityType;
  address: string;
  administrativeAreaCode: string;
  latitude: number;
  longitude: number;
  contactPhone: string;
  contactEmail: string;
  openingHoursSummary: string;
  services: ReadonlyArray<{ serviceCode: string; serviceName: string }>;
}> = [
  {
    sourceReference: 'SYN-RW-FAC-KGL-001',
    name: 'Synthetic Gasabo Preventive Referral Hospital (Fixture)',
    facilityType: FacilityType.hospital,
    address: 'KG 544 Synthetic Health Ave, Gasabo, Kigali (Synthetic Fixture)',
    administrativeAreaCode: 'RW-01-GASABO',
    latitude: -1.9441,
    longitude: 30.0619,
    contactPhone: '+250780000101',
    contactEmail: 'gasabo-hospital.synthetic@example.invalid',
    openingHoursSummary: '24/7 Emergency & Mon-Fri 08:00-17:00 Outpatient',
    services: [
      { serviceCode: 'primary_care', serviceName: 'Primary Preventive Care' },
      {
        serviceCode: 'ncd_preventive_screening',
        serviceName: 'NCD Lifestyle & Preventive Screening',
      },
      { serviceCode: 'emergency_care', serviceName: '24/7 Emergency Care' },
    ],
  },
  {
    sourceReference: 'SYN-RW-FAC-KGL-002',
    name: 'Synthetic Nyarugenge Community Health Center (Fixture)',
    facilityType: FacilityType.health_center,
    address: 'KN 120 Synthetic Wellness Rd, Nyarugenge, Kigali (Synthetic Fixture)',
    administrativeAreaCode: 'RW-01-NYARUGENGE',
    latitude: -1.9536,
    longitude: 30.0606,
    contactPhone: '+250780000102',
    contactEmail: 'nyarugenge-hc.synthetic@example.invalid',
    openingHoursSummary: 'Mon-Sat 07:30-18:00',
    services: [
      { serviceCode: 'primary_care', serviceName: 'Primary Preventive Care' },
      {
        serviceCode: 'tobacco_cessation_support',
        serviceName: 'Preventive Lifestyle & Tobacco Cessation Counseling',
      },
    ],
  },
  {
    sourceReference: 'SYN-RW-FAC-HUY-003',
    name: 'Synthetic Huye Mental Wellness & Support Center (Fixture)',
    facilityType: FacilityType.mental_health_center,
    address: 'SH 10 Synthetic Campus Blvd, Huye, Southern Province (Synthetic Fixture)',
    administrativeAreaCode: 'RW-05-HUYE',
    latitude: -2.5967,
    longitude: 29.7394,
    contactPhone: '+250780000103',
    contactEmail: 'huye-wellness.synthetic@example.invalid',
    openingHoursSummary: 'Mon-Sun 08:00-20:00 & Crisis Referral Desk',
    services: [
      {
        serviceCode: 'mental_health_support',
        serviceName: 'Psychosocial & Mental Wellbeing Support',
      },
      { serviceCode: 'primary_care', serviceName: 'General Preventive Consultation' },
    ],
  },
  {
    sourceReference: 'SYN-RW-FAC-MUS-004',
    name: 'Synthetic Musanze Preventive Community Pharmacy (Fixture)',
    facilityType: FacilityType.pharmacy,
    address: 'RN 4 Synthetic Virunga St, Musanze, Northern Province (Synthetic Fixture)',
    administrativeAreaCode: 'RW-03-MUSANZE',
    latitude: -1.4998,
    longitude: 29.635,
    contactPhone: '+250780000104',
    contactEmail: 'musanze-pharmacy.synthetic@example.invalid',
    openingHoursSummary: 'Mon-Sun 08:00-21:00',
    services: [
      {
        serviceCode: 'pharmacy_guidance',
        serviceName: 'Pharmacist Preventive Health Guidance',
      },
      {
        serviceCode: 'ncd_preventive_screening',
        serviceName: 'Blood Pressure & Preventive Wellness Check',
      },
    ],
  },
];

export interface SyntheticSeedSummary {
  rolesCount: number;
  consentPurposesCount: number;
  riskUseCasesCount: number;
  dataSourcesCount: number;
  facilitiesCount: number;
}

/**
 * Idempotently seeds approved baseline roles, v1 consent purposes, risk use cases / rule versions,
 * synthetic data sources, and synthetic Rwanda facilities.
 * Refuses to execute when `NODE_ENV === 'production'`.
 */
export async function seedSyntheticBaseline(
  prisma: PrismaClient,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Promise<SyntheticSeedSummary> {
  assertNonProduction('seedSyntheticBaseline', nodeEnv);

  const verifiedAt = new Date('2026-11-24T00:00:00.000Z');

  for (const role of SYNTHETIC_ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { description: role.description },
      create: {
        code: role.code,
        description: role.description,
      },
    });
  }

  for (const purpose of SYNTHETIC_CONSENT_PURPOSES_V1) {
    await prisma.consentPurpose.upsert({
      where: {
        code_version: {
          code: purpose.code,
          version: purpose.version,
        },
      },
      update: {
        title: purpose.title,
        description: purpose.description,
        dataCategories: purpose.dataCategories,
        isRequiredForOnboarding: purpose.isRequiredForOnboarding,
        status: ConsentPurposeStatus.active,
      },
      create: {
        code: purpose.code,
        version: purpose.version,
        title: purpose.title,
        description: purpose.description,
        dataCategories: purpose.dataCategories,
        isRequiredForOnboarding: purpose.isRequiredForOnboarding,
        status: ConsentPurposeStatus.active,
      },
    });
  }

  for (const useCase of SYNTHETIC_RISK_USE_CASES) {
    const upsertedUseCase = await prisma.riskUseCase.upsert({
      where: { code: useCase.code },
      update: {
        name: useCase.name,
        description: useCase.description,
        intendedUse: useCase.intendedUse,
        excludedUse: useCase.excludedUse,
        requiredInputCategories: useCase.requiredInputCategories,
        status: useCase.status,
        clinicalReviewStatus: useCase.clinicalReviewStatus,
      },
      create: {
        code: useCase.code,
        name: useCase.name,
        description: useCase.description,
        intendedUse: useCase.intendedUse,
        excludedUse: useCase.excludedUse,
        requiredInputCategories: useCase.requiredInputCategories,
        status: useCase.status,
        clinicalReviewStatus: useCase.clinicalReviewStatus,
      },
    });

    await prisma.ruleModelVersion.upsert({
      where: {
        riskUseCaseId_version: {
          riskUseCaseId: upsertedUseCase.id,
          version: useCase.ruleVersion.version,
        },
      },
      update: {
        implementationType: useCase.ruleVersion.implementationType,
        configurationReference: useCase.ruleVersion.configurationReference,
        effectiveFrom: useCase.ruleVersion.effectiveFrom,
        approvalStatus: useCase.ruleVersion.approvalStatus,
        limitations: useCase.ruleVersion.limitations,
        evaluationReference: useCase.ruleVersion.evaluationReference,
      },
      create: {
        riskUseCaseId: upsertedUseCase.id,
        version: useCase.ruleVersion.version,
        implementationType: useCase.ruleVersion.implementationType,
        configurationReference: useCase.ruleVersion.configurationReference,
        effectiveFrom: useCase.ruleVersion.effectiveFrom,
        approvalStatus: useCase.ruleVersion.approvalStatus,
        limitations: useCase.ruleVersion.limitations,
        evaluationReference: useCase.ruleVersion.evaluationReference,
      },
    });
  }

  let facilityRegistrySourceId = '';
  for (const ds of SYNTHETIC_DATA_SOURCES) {
    const upsertedSource = await prisma.dataSource.upsert({
      where: { code: ds.code },
      update: {
        name: ds.name,
        sourceType: ds.sourceType,
        owner: ds.owner,
        purpose: ds.purpose,
        trustStatus: ds.trustStatus,
        isCalculationApproved: ds.isCalculationApproved,
        termsReference: ds.termsReference,
        lastReviewedAt: verifiedAt,
      },
      create: {
        code: ds.code,
        name: ds.name,
        sourceType: ds.sourceType,
        owner: ds.owner,
        purpose: ds.purpose,
        trustStatus: ds.trustStatus,
        isCalculationApproved: ds.isCalculationApproved,
        termsReference: ds.termsReference,
        lastReviewedAt: verifiedAt,
      },
    });

    if (ds.code === 'rwanda_synthetic_facility_registry') {
      facilityRegistrySourceId = upsertedSource.id;
    }
  }

  for (const fac of SYNTHETIC_FACILITIES) {
    const upsertedFacility = await prisma.facility.upsert({
      where: {
        dataSourceId_sourceReference: {
          dataSourceId: facilityRegistrySourceId,
          sourceReference: fac.sourceReference,
        },
      },
      update: {
        name: fac.name,
        facilityType: fac.facilityType,
        status: FacilityStatus.active,
        address: fac.address,
        administrativeAreaCode: fac.administrativeAreaCode,
        latitude: fac.latitude,
        longitude: fac.longitude,
        contactPhone: fac.contactPhone,
        contactEmail: fac.contactEmail,
        openingHoursSummary: fac.openingHoursSummary,
        lastVerifiedAt: verifiedAt,
        verificationNote: '100% synthetic fixture for automated testing and local development',
      },
      create: {
        name: fac.name,
        facilityType: fac.facilityType,
        status: FacilityStatus.active,
        address: fac.address,
        administrativeAreaCode: fac.administrativeAreaCode,
        latitude: fac.latitude,
        longitude: fac.longitude,
        contactPhone: fac.contactPhone,
        contactEmail: fac.contactEmail,
        openingHoursSummary: fac.openingHoursSummary,
        dataSourceId: facilityRegistrySourceId,
        sourceReference: fac.sourceReference,
        lastVerifiedAt: verifiedAt,
        verificationNote: '100% synthetic fixture for automated testing and local development',
      },
    });

    for (const svc of fac.services) {
      await prisma.facilityService.upsert({
        where: {
          facilityId_serviceCode: {
            facilityId: upsertedFacility.id,
            serviceCode: svc.serviceCode,
          },
        },
        update: {
          serviceName: svc.serviceName,
          status: 'active',
          lastVerifiedAt: verifiedAt,
        },
        create: {
          facilityId: upsertedFacility.id,
          serviceCode: svc.serviceCode,
          serviceName: svc.serviceName,
          status: 'active',
          lastVerifiedAt: verifiedAt,
        },
      });
    }
  }

  return {
    rolesCount: SYNTHETIC_ROLES.length,
    consentPurposesCount: SYNTHETIC_CONSENT_PURPOSES_V1.length,
    riskUseCasesCount: SYNTHETIC_RISK_USE_CASES.length,
    dataSourcesCount: SYNTHETIC_DATA_SOURCES.length,
    facilitiesCount: SYNTHETIC_FACILITIES.length,
  };
}
