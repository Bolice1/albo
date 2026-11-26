import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditOutcome, HealthInputStatus, RiskAssessmentStatus, RoleCode } from '@prisma/client';
import { Writable } from 'node:stream';
import request from 'supertest';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@database/redis.service';
import { seedSyntheticBaseline } from '@database/seeds/seed-synthetic';
import { AiServiceClient } from '@integrations/ai-service/ai-service.client';
import { signSyntheticTestJwt } from '@integrations/identity/oidc-jwt-verifier.service';
import { SandboxRwandaEnvironmentalAdapter } from '@integrations/weather/weather.adapter';
import { AppModule } from '../../src/app.module';
import { configureHttpApplication } from '../../src/bootstrap';
import {
  applySyntheticTestEnv,
  resetTestDatabase,
  SYNTHETIC_TEST_ENV,
} from '../helpers/test-env.helper';

describe('Phase 2B Integration: Vertical Slice 1, Health Inputs, Check-ins, Environment & Risk Engine', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let weatherAdapter: SandboxRwandaEnvironmentalAdapter;
  const capturedLogs: string[] = [];

  async function mintToken(subject: string): Promise<string> {
    return signSyntheticTestJwt({
      subject,
      secret: SYNTHETIC_TEST_ENV.JWT_HS256_SECRET,
      issuer: SYNTHETIC_TEST_ENV.JWT_ISSUER,
      audience: SYNTHETIC_TEST_ENV.JWT_AUDIENCE,
    });
  }

  beforeAll(async () => {
    applySyntheticTestEnv({
      FEATURE_CHECKINS_ENABLED: 'true',
      APPROVED_RISK_RULE_VERSIONS:
        'lifestyle_ncd_preventive:rules-v1.0.0,malaria_exposure_preventive:rules-v0.1.0-draft',
    });

    const logStream = new Writable({
      write(chunk, _enc, cb) {
        const text = chunk.toString('utf8');
        for (const line of text.split('\n')) {
          if (line.trim()) {
            capturedLogs.push(line.trim());
          }
        }
        cb();
      },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(logStream)],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureHttpApplication(app);
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    weatherAdapter = app.get(SandboxRwandaEnvironmentalAdapter);
  });

  beforeEach(async () => {
    capturedLogs.length = 0;
    weatherAdapter.setSimulatedUnavailable(false);
    await redis.getClient().flushdb();
    await resetTestDatabase(prisma);
    await seedSyntheticBaseline(prisma, 'test');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('executes the complete 8-step Vertical Slice 1 journey, supersession, consent withdrawal, and IDOR isolation', async () => {
    const citizenAToken = await mintToken('synthetic-citizen-slice1-a');
    const citizenBToken = await mintToken('synthetic-citizen-slice1-b');

    // Step 1: Citizen A authenticates -> application account created safely without IdP internals (DP-003)
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .expect(200);

    expect(meRes.body.data.account_status).toBe('active');
    expect(meRes.body.data.roles).toContain('citizen');
    expect(meRes.body.data.external_subject_id).toBeUndefined();

    // Citizen B also registers so records exist concurrently
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${citizenBToken}`)
      .expect(200);

    // Step 2: Attempting risk calculation before consent -> 403 CONSENT_REQUIRED (FR-003, DP-002)
    const preConsentRisk = await request(app.getHttpServer())
      .post('/api/v1/me/risk-assessments')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .send({})
      .expect(403);
    expect(preConsentRisk.body.error.code).toBe('CONSENT_REQUIRED');

    // Step 3: Citizen A grants health_input_storage and preventive_risk_calculation consents (FR-004, FR-038)
    const storageConsentRes = await request(app.getHttpServer())
      .post('/api/v1/me/consents')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .set('Idempotency-Key', 'idem-slice1-consent-storage')
      .send({ purpose_code: 'health_input_storage', version: 'v1' })
      .expect(201);

    const riskConsentRes = await request(app.getHttpServer())
      .post('/api/v1/me/consents')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .set('Idempotency-Key', 'idem-slice1-consent-risk')
      .send({ purpose_code: 'preventive_risk_calculation', version: 'v1' })
      .expect(201);

    const riskConsentId = riskConsentRes.body.data.id as string;
    expect(storageConsentRes.body.data.status).toBe('granted');
    expect(riskConsentRes.body.data.status).toBe('granted');

    // Step 4: Reject unapproved clinical fields and body spoofing without leaking values (FR-009, T-004, T-006, T-017)
    const secretBiomarkerSentinel = 'SYNTHETIC_SECRET_BIOMARKER_98765';
    const invalidFieldRes = await request(app.getHttpServer())
      .post('/api/v1/me/health-inputs')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .send({
        field_code: 'hiv_viral_load_unapproved',
        value: secretBiomarkerSentinel,
      })
      .expect(422);

    expect(invalidFieldRes.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(invalidFieldRes.body)).not.toContain(secretBiomarkerSentinel);

    const spoofedBodyRes = await request(app.getHttpServer())
      .post('/api/v1/me/health-inputs')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .send({
        user_id: '00000000-0000-4000-8000-000000000999',
        field_code: 'tobacco_use_status',
        value: 'never',
      })
      .expect(422);
    expect(spoofedBodyRes.body.error.code).toBe('VALIDATION_ERROR');

    // Submit only 1 required input first -> risk calculation must degrade safely to `limited` (`level: null`), NEVER `low`! (FR-018, HAZ-01)
    const activityInputRes = await request(app.getHttpServer())
      .post('/api/v1/me/health-inputs')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .send({
        field_code: 'physical_activity_minutes_per_week',
        value: 45,
        unit: 'min/week',
      })
      .expect(201);

    const activityInputId = activityInputRes.body.data.id as string;
    expect(activityInputRes.body.data.source_type).toBe('self_reported');

    const missingTobaccoRisk = await request(app.getHttpServer())
      .post('/api/v1/me/risk-assessments')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .send({ use_case_code: 'lifestyle_ncd_preventive' })
      .expect(201);

    expect(missingTobaccoRisk.body.data.status).toBe('limited');
    expect(missingTobaccoRisk.body.data.level).toBeNull();
    expect(missingTobaccoRisk.body.data.safety_metadata.missing_or_stale_fields).toContain(
      'tobacco_use_status',
    );

    // Submit second required input + optional inputs -> complete deterministic risk assessment via live FastAPI!
    await request(app.getHttpServer())
      .post('/api/v1/me/health-inputs')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .send({
        field_code: 'tobacco_use_status',
        value: 'current',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/me/health-inputs')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .send({
        field_code: 'diet_fruit_veg_servings_per_day',
        value: 3, // 2..4 neutral rule per ADR-015
        unit: 'servings/day',
      })
      .expect(201);

    // Step 5 & 6: Calculate complete risk indicator (45 min/week = +2, current tobacco = +3 -> total 5 -> `high`)
    const completeRiskRes = await request(app.getHttpServer())
      .post('/api/v1/me/risk-assessments')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .send({
        use_case_code: 'lifestyle_ncd_preventive',
        rule_model_version: 'rules-v1.0.0',
      })
      .expect(201);

    const firstCompleteId = completeRiskRes.body.data.id as string;
    const firstSnapshotId = completeRiskRes.body.data.provenance.input_snapshot_id as string;

    expect(completeRiskRes.body.data.status).toBe('complete');
    expect(completeRiskRes.body.data.level).toBe('high');
    expect(completeRiskRes.body.data.rule_model_version).toBe('rules-v1.0.0');
    expect(completeRiskRes.body.data.contributing_factors.length).toBeGreaterThanOrEqual(2);
    expect(
      completeRiskRes.body.data.limitations.some((l: string) =>
        l.toLowerCase().includes('not a medical diagnosis'),
      ),
    ).toBe(true);
    expect(completeRiskRes.body.data.recommended_next_steps.length).toBeGreaterThan(0);

    // Verify PII-free snapshot invariant in PostgreSQL (AI-002)
    const snapshotRow = await prisma.inputSnapshot.findUniqueOrThrow({
      where: { id: firstSnapshotId },
    });
    const rawSnapshotJson = JSON.stringify(snapshotRow.inputPayload);
    expect(rawSnapshotJson).not.toContain('synthetic-citizen-slice1-a');
    expect(rawSnapshotJson).not.toContain(meRes.body.data.id);

    // Step 6b: Immutable health-input supersession (`PATCH /api/v1/me/health-inputs/:inputId`, ADR-017)
    const supersededRes = await request(app.getHttpServer())
      .patch(`/api/v1/me/health-inputs/${activityInputId}`)
      .set('Authorization', `Bearer ${citizenAToken}`)
      .send({
        value: 180,
        unit: 'min/week',
      })
      .expect(200);

    expect(supersededRes.body.data.id).not.toBe(activityInputId);
    expect(supersededRes.body.data.supersedes_input_id).toBe(activityInputId);
    expect(supersededRes.body.data.status).toBe(HealthInputStatus.active);

    const priorInputRow = await prisma.healthInput.findUniqueOrThrow({
      where: { id: activityInputId },
    });
    expect(priorInputRow.status).toBe(HealthInputStatus.superseded);
    expect(priorInputRow.numericValue).toBe(45); // Original value preserved!

    // Recalculate -> 180 min/week (+0) + current tobacco (+3 + moderate floor) = 3 points -> `moderate`, superseding `firstCompleteId`
    const secondRiskRes = await request(app.getHttpServer())
      .post('/api/v1/me/risk-assessments')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .send({ use_case_code: 'lifestyle_ncd_preventive' })
      .expect(201);

    expect(secondRiskRes.body.data.status).toBe('complete');
    expect(secondRiskRes.body.data.level).toBe('moderate');

    const priorAssessmentRow = await prisma.riskAssessment.findUniqueOrThrow({
      where: { id: firstCompleteId },
    });
    expect(priorAssessmentRow.status).toBe(RiskAssessmentStatus.superseded);
    expect(priorAssessmentRow.level).toBeNull();
    expect(priorAssessmentRow.supersededById).toBe(secondRiskRes.body.data.id);

    // Step 7: Stale input (> 720h relative to calculated_for_timestamp) -> returns `limited`, `level: null`
    const futureEvalTimestamp = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString();
    const staleRiskRes = await request(app.getHttpServer())
      .post('/api/v1/me/risk-assessments')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .send({
        use_case_code: 'lifestyle_ncd_preventive',
        calculated_for_timestamp: futureEvalTimestamp,
      })
      .expect(201);

    expect(staleRiskRes.body.data.status).toBe('limited');
    expect(staleRiskRes.body.data.level).toBeNull();

    // Step 8: Horizontal IDOR & Pagination Isolation (Citizen B gets 404 NOT_FOUND on Citizen A's resources, T-003 & T-009)
    await request(app.getHttpServer())
      .get(`/api/v1/me/health-inputs/${supersededRes.body.data.id}`)
      .set('Authorization', `Bearer ${citizenBToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/me/health-inputs/${supersededRes.body.data.id}`)
      .set('Authorization', `Bearer ${citizenBToken}`)
      .send({ value: 200, unit: 'min/week' })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/me/risk-assessments/${secondRiskRes.body.data.id}`)
      .set('Authorization', `Bearer ${citizenBToken}`)
      .expect(404);

    const citizenBListRes = await request(app.getHttpServer())
      .get('/api/v1/me/risk-assessments')
      .set('Authorization', `Bearer ${citizenBToken}`)
      .expect(200);
    expect(citizenBListRes.body.data).toEqual([]);

    // Step 8b: Consent withdrawal immediately blocks subsequent risk calculation (T-044)
    await request(app.getHttpServer())
      .post(`/api/v1/me/consents/${riskConsentId}/withdraw`)
      .set('Authorization', `Bearer ${citizenAToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/me/risk-assessments')
      .set('Authorization', `Bearer ${citizenAToken}`)
      .send({ use_case_code: 'lifestyle_ncd_preventive' })
      .expect(403);

    // Verify redaction across logs and audit_events (DP-008, FR-039)
    const allLogsJoined = capturedLogs.join('\n');
    expect(allLogsJoined).not.toContain(citizenAToken);
    expect(allLogsJoined).not.toContain(secretBiomarkerSentinel);

    const deniedAudits = await prisma.auditEvent.findMany({
      where: { outcome: AuditOutcome.denied },
    });
    expect(deniedAudits.length).toBeGreaterThanOrEqual(3);
  });

  it('degrades safely to status="failed" (level=null, never low) when ai-services is unreachable (ADR-013)', async () => {
    const token = await mintToken('synthetic-citizen-ai-outage');

    await request(app.getHttpServer())
      .post('/api/v1/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .send({ purpose_code: 'health_input_storage', version: 'v1' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .send({ purpose_code: 'preventive_risk_calculation', version: 'v1' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/me/health-inputs')
      .set('Authorization', `Bearer ${token}`)
      .send({ field_code: 'physical_activity_minutes_per_week', value: 200, unit: 'min/week' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/me/health-inputs')
      .set('Authorization', `Bearer ${token}`)
      .send({ field_code: 'tobacco_use_status', value: 'never' })
      .expect(201);

    const aiClient = app.get(AiServiceClient);
    const spy = jest
      .spyOn(aiClient, 'calculateRiskAssessment')
      .mockRejectedValueOnce(
        new (await import('@common/errors/app.exception')).DependencyUnavailableException(
          'Simulated AI outage',
        ),
      );

    try {
      const degradedRes = await request(app.getHttpServer())
        .post('/api/v1/me/risk-assessments')
        .set('Authorization', `Bearer ${token}`)
        .send({ use_case_code: 'lifestyle_ncd_preventive' })
        .expect(201);

      expect(degradedRes.body.data.status).toBe('failed');
      expect(degradedRes.body.data.level).toBeNull();
      expect(degradedRes.body.data.safety_metadata.reason_codes).toContain(
        'AI_SERVICE_UNAVAILABLE',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('screens structured wellbeing check-ins synchronously, returning crisis escalation + verified facilities on red flags (FR-024)', async () => {
    const token = await mintToken('synthetic-citizen-checkin');

    await request(app.getHttpServer())
      .post('/api/v1/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .send({ purpose_code: 'wellbeing_check_ins', version: 'v1' })
      .expect(201);

    const normalRes = await request(app.getHttpServer())
      .post('/api/v1/me/check-ins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        questionnaire_version: 'wellbeing-v1',
        responses: {
          stress_frequency_score: 1,
          exhaustion_score: 1,
          sleep_quality_score: 1,
          self_harm_signal: 0,
        },
      })
      .expect(201);

    expect(normalRes.body.data.safety_status).toBe('normal');
    expect(normalRes.body.data.escalation_required).toBe(false);
    expect(normalRes.body.data.crisis_escalation).toBeNull();

    const sensitiveCrisisPhrase = 'I want to end my life tonight synthetic test sentinel';
    const escalatedRes = await request(app.getHttpServer())
      .post('/api/v1/me/check-ins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        questionnaire_version: 'wellbeing-v1',
        responses: {
          stress_frequency_score: 4,
          exhaustion_score: 4,
          sleep_quality_score: 3,
          self_harm_signal: 1,
        },
        free_text_reflection: sensitiveCrisisPhrase,
      })
      .expect(201);

    expect(escalatedRes.body.data.safety_status).toBe('escalated');
    expect(escalatedRes.body.data.escalation_required).toBe(true);
    expect(escalatedRes.body.data.crisis_escalation).not.toBeNull();
    expect(escalatedRes.body.data.crisis_escalation.category).toBe('mental_health_crisis');
    expect(escalatedRes.body.data.crisis_escalation.verified_facilities.length).toBeGreaterThan(0);

    // Ensure raw crisis reflection text was never stored in audit_events or logs (DP-008)
    const allAudits = JSON.stringify(await prisma.auditEvent.findMany());
    expect(allAudits).not.toContain(sensitiveCrisisPhrase);
    expect(capturedLogs.join('\n')).not.toContain(sensitiveCrisisPhrase);
  });

  it('ingests coarse regional environmental observations via sandbox adapter and handles unavailable state safely', async () => {
    const adminToken = await mintToken('synthetic-env-admin');
    const citizenToken = await mintToken('synthetic-env-citizen');

    // Bootstrap admin role
    const adminMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.platform_admin },
    });
    await prisma.userRole.create({
      data: {
        userAccountId: adminMe.body.data.id,
        roleId: adminRole.id,
      },
    });

    // Before ingestion -> safe `unavailable` state
    const emptyEnv = await request(app.getHttpServer())
      .get('/api/v1/environment?area_code=RW-KGL-GASABO')
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(200);
    expect(emptyEnv.body.data.status).toBe('unavailable');
    expect(emptyEnv.body.data.observations).toEqual([]);

    // Admin ingests RW-KGL-GASABO
    const ingestRes = await request(app.getHttpServer())
      .post('/api/v1/admin/environment/ingest')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ area_code: 'RW-KGL-GASABO' })
      .expect(201);
    expect(ingestRes.body.data.status).toBe('succeeded');
    expect(ingestRes.body.data.items_accepted).toBe(3);

    const populatedEnv = await request(app.getHttpServer())
      .get('/api/v1/environment?area_code=RW-KGL-GASABO')
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(200);
    expect(populatedEnv.body.data.status).toBe('available');
    expect(populatedEnv.body.data.observations.length).toBe(3);

    // Simulated provider outage records `failed` ingestion without crashing or fabricating observations
    weatherAdapter.setSimulatedUnavailable(true);
    const failedIngest = await request(app.getHttpServer())
      .post('/api/v1/admin/environment/ingest')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ area_code: 'RW-SOUTH-HUYE' })
      .expect(201);
    expect(failedIngest.body.data.status).toBe('failed');
  });
});
