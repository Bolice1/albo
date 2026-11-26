import 'reflect-metadata';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AccountStatus,
  AssignmentStatus,
  AuditOutcome,
  ConsentRecordStatus,
  HealthInputCategory,
  DataSourceType,
  HealthInputStatus,
  MembershipStatus,
  RiskAssessmentStatus,
  RiskLevel,
  RoleCode,
} from '@prisma/client';
import { Writable } from 'node:stream';
import request from 'supertest';
import { AppConfigService } from '@config/app-config.service';
import { Public } from '@common/decorators/public.decorator';
import {
  ConsentRequiredException,
  FeatureDisabledException,
  ResourceNotFoundException,
} from '@common/errors/app.exception';
import { RateLimit } from '@common/http/rate-limit.guard';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@database/redis.service';
import { seedSyntheticBaseline } from '@database/seeds/seed-synthetic';
import { signSyntheticTestJwt } from '@integrations/identity/oidc-jwt-verifier.service';
import { AuditService } from '@modules/audit/audit.service';
import { ConsentService } from '@modules/consent/consent.service';
import { AccessPolicyService } from '@modules/identity-access/access-policy.service';
import { AppModule } from '../../src/app.module';
import { configureHttpApplication } from '../../src/bootstrap';
import {
  applySyntheticTestEnv,
  resetTestDatabase,
  SYNTHETIC_TEST_ENV,
} from '../helpers/test-env.helper';

@Public()
@Controller('rate-limit-probe')
class RateLimitProbeController {
  @Get()
  @RateLimit({ category: 'integration_probe', limit: 2, windowSeconds: 30 })
  probe() {
    return { allowed: true };
  }
}

describe('Phase 2A Integration: Identity, Access Control, Consent, Admin & Audit (Live albo_test DB + Redis)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let consentService: ConsentService;
  let accessPolicy: AccessPolicyService;
  let auditService: AuditService;
  let configService: AppConfigService;
  const capturedLogs: string[] = [];

  beforeAll(async () => {
    applySyntheticTestEnv({
      FEATURE_PROVIDER_PORTAL_ENABLED: 'true',
    });

    const logStream = new Writable({
      write(chunk, _enc, cb) {
        const str = chunk.toString('utf8');
        for (const line of str.split('\n')) {
          if (line.trim()) {
            capturedLogs.push(line.trim());
          }
        }
        cb();
      },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(logStream)],
      controllers: [RateLimitProbeController],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureHttpApplication(app);
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    consentService = app.get(ConsentService);
    accessPolicy = app.get(AccessPolicyService);
    auditService = app.get(AuditService);
    configService = app.get(AppConfigService);
  });

  beforeEach(async () => {
    capturedLogs.length = 0;
    await redis.getClient().flushdb();
    await resetTestDatabase(prisma);
    await seedSyntheticBaseline(prisma, 'test');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function promoteToPlatformAdmin(
    userAccountId: string,
    keepCitizenRole = false,
  ): Promise<void> {
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.platform_admin },
    });
    if (!keepCitizenRole) {
      await prisma.userRole.updateMany({
        where: { userAccountId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await prisma.userRole.create({
      data: {
        userAccountId,
        roleId: adminRole.id,
      },
    });
  }

  describe('1. Synthetic Baseline Seed & Database Safety Invariants', () => {
    it('idempotently seeds all 5 roles, 9 v1 consent purposes, 5 risk use cases, 3 data sources, and 4 PostGIS facilities', async () => {
      const secondRun = await seedSyntheticBaseline(prisma, 'test');
      expect(secondRun).toEqual({
        rolesCount: 5,
        consentPurposesCount: 9,
        riskUseCasesCount: 5,
        dataSourcesCount: 3,
        facilitiesCount: 4,
      });

      const [roles, purposes, useCases, facilities] = await Promise.all([
        prisma.role.count(),
        prisma.consentPurpose.count({ where: { status: 'active' } }),
        prisma.riskUseCase.count(),
        prisma.facility.findMany(),
      ]);

      expect(roles).toBe(5);
      expect(purposes).toBe(9);
      expect(useCases).toBe(5);
      expect(facilities).toHaveLength(4);
      for (const fac of facilities) {
        expect(fac.contactEmail).toMatch(/@example\.invalid$/);
      }

      // Verify PostGIS stored generated geography column is populated
      const spatialCheck = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "facilities" WHERE "location" IS NOT NULL
      `;
      expect(Number(spatialCheck[0]?.count)).toBe(4);

      await expect(seedSyntheticBaseline(prisma, 'production')).rejects.toThrow(
        /prohibited when NODE_ENV is "production"/,
      );
    });

    it('enforces risk_assessments_status_level_chk and audit_events append-only trigger at PostgreSQL level', async () => {
      const token = await signSyntheticTestJwt({ subject: 'syn-db-chk-citizen' });
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const userId: string = meRes.body.data.id;

      const grantRes = await request(app.getHttpServer())
        .post('/api/v1/me/consents')
        .set('Authorization', `Bearer ${token}`)
        .send({ purpose_code: 'preventive_risk_calculation', version: 'v1' })
        .expect(201);
      const consentId: string = grantRes.body.data.id;

      const useCase = await prisma.riskUseCase.findUniqueOrThrow({
        where: { code: 'lifestyle_ncd_preventive' },
        include: { ruleModelVersions: true },
      });
      const ruleVersionId = useCase.ruleModelVersions[0]!.id;

      const snapshot1 = await prisma.inputSnapshot.create({
        data: {
          userAccountId: userId,
          riskUseCaseId: useCase.id,
          consentRecordId: consentId,
          calculatedForTimestamp: new Date(),
          inputPayload: { health_inputs: [] },
          payloadSha256: 'a'.repeat(64),
          dataQualityStatus: 'limited',
        },
      });

      // HAZ-01 guardrail: status='limited' with level='low' MUST be rejected by PostgreSQL CHECK constraint
      await expect(
        prisma.riskAssessment.create({
          data: {
            userAccountId: userId,
            riskUseCaseId: useCase.id,
            ruleModelVersionId: ruleVersionId,
            inputSnapshotId: snapshot1.id,
            status: RiskAssessmentStatus.limited,
            level: RiskLevel.low,
          },
        }),
      ).rejects.toThrow();

      // status='complete' with level=null MUST also be rejected
      await expect(
        prisma.riskAssessment.create({
          data: {
            userAccountId: userId,
            riskUseCaseId: useCase.id,
            ruleModelVersionId: ruleVersionId,
            inputSnapshotId: snapshot1.id,
            status: RiskAssessmentStatus.complete,
            level: null,
          },
        }),
      ).rejects.toThrow();

      // Valid limited assessment (level=null) succeeds
      const validLimited = await prisma.riskAssessment.create({
        data: {
          userAccountId: userId,
          riskUseCaseId: useCase.id,
          ruleModelVersionId: ruleVersionId,
          inputSnapshotId: snapshot1.id,
          status: RiskAssessmentStatus.limited,
          level: null,
          limitations: ['Missing required inputs.'],
        },
      });
      expect(validLimited.status).toBe(RiskAssessmentStatus.limited);
      expect(validLimited.level).toBeNull();

      // T-021 guardrail: audit_events append-only trigger rejects UPDATE and DELETE
      const auditRow = await auditService.record({
        actorId: userId,
        actorType: 'user',
        action: 'test.immutability_probe',
        resourceType: 'audit_event',
        outcome: AuditOutcome.succeeded,
      });

      await expect(
        prisma.auditEvent.update({
          where: { id: auditRow.id },
          data: { action: 'tampered.action' },
        }),
      ).rejects.toThrow(/append-only/);

      await expect(
        prisma.auditEvent.delete({
          where: { id: auditRow.id },
        }),
      ).rejects.toThrow(/append-only/);
    });
  });

  describe('2. OIDC / JWT Verification Boundary (ADR-011)', () => {
    it('rejects missing, expired, wrong-issuer, wrong-audience, bad-signature, and exp-less tokens with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/me').expect(401);

      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .expect(401);

      const expiredJwt = await signSyntheticTestJwt({
        subject: 'syn-jwt-expired',
        expiresInSeconds: -120,
      });
      const expiredRes = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${expiredJwt}`)
        .expect(401);
      expect(expiredRes.body.error.code).toBe('UNAUTHENTICATED');

      const wrongIssJwt = await signSyntheticTestJwt({
        subject: 'syn-jwt-wrong-iss',
        issuer: 'https://evil-issuer.example.invalid',
      });
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${wrongIssJwt}`)
        .expect(401);

      const wrongAudJwt = await signSyntheticTestJwt({
        subject: 'syn-jwt-wrong-aud',
        audience: 'other-service-aud',
      });
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${wrongAudJwt}`)
        .expect(401);

      const badSigJwt = await signSyntheticTestJwt({
        subject: 'syn-jwt-bad-sig',
        secret: 'different_synthetic_secret_at_least_32_characters_long',
      });
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${badSigJwt}`)
        .expect(401);

      const missingExpJwt = await signSyntheticTestJwt({
        subject: 'syn-jwt-no-exp',
        includeExp: false,
      });
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${missingExpJwt}`)
        .expect(401);
    });
  });

  describe('3. Account Provisioning, Adult 18+ Profile, Data Exports & Deletion (/api/v1/me)', () => {
    it('provisions citizen account on first /api/v1/me without exposing IdP internals and enforces 18+ birth_year', async () => {
      const token = await signSyntheticTestJwt({
        subject: 'idp-sub-synthetic-citizen-01',
      });

      const meRes = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meRes.body.data).toMatchObject({
        account_status: AccountStatus.active,
        preferred_language: 'en',
        timezone: 'Africa/Kigali',
        roles: [RoleCode.citizen],
        onboarding_completed_at: null,
      });
      expect(meRes.body.data.identity_subject_id).toBeUndefined();
      expect(meRes.body.data.external_subject_id).toBeUndefined();
      expect(JSON.stringify(meRes.body)).not.toContain('idp-sub-synthetic-citizen-01');

      // Minor birth_year (< 18) rejected with 422 VALIDATION_ERROR (ADR-010)
      const currentYear = new Date().getUTCFullYear();
      const minorRes = await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ birth_year: currentYear - 16 })
        .expect(422);

      expect(minorRes.body.error.code).toBe('VALIDATION_ERROR');
      expect(minorRes.body.error.details).toEqual([
        { field: 'birth_year', reason: 'must_be_adult_18_plus' },
      ]);

      // Adult birth_year (>= 18) + onboarding completion succeeds
      const adultBirthYear = currentYear - 28;
      const patchRes = await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          display_name: 'Synthetic Citizen Uwase',
          birth_year: adultBirthYear,
          administrative_area_code: 'RW-01-GASABO',
          preferred_language: 'rw',
          mark_onboarding_completed: true,
        })
        .expect(200);

      expect(patchRes.body.data).toMatchObject({
        user_account_id: meRes.body.data.id,
        display_name: 'Synthetic Citizen Uwase',
        birth_year: adultBirthYear,
        administrative_area_code: 'RW-01-GASABO',
        preferred_language: 'rw',
      });
      expect(patchRes.body.data.onboarding_completed_at).toEqual(expect.any(String));
    });

    it('provides owner-scoped data exports (404 on cross-user access) and blocks pending_deletion / suspended accounts with 403', async () => {
      const citizenAToken = await signSyntheticTestJwt({
        subject: 'syn-citizen-export-a',
      });
      const citizenBToken = await signSyntheticTestJwt({
        subject: 'syn-citizen-export-b',
      });

      const exportRes = await request(app.getHttpServer())
        .post('/api/v1/me/data-exports')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .set('Idempotency-Key', 'idem-export-001')
        .expect(201);

      const exportId: string = exportRes.body.data.id;
      expect(exportRes.body.data.status).toBe('ready');
      expect(exportRes.body.data.summary.schema_version).toBe('v1');

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/me/data-exports')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .expect(200);
      expect(listRes.body.data).toHaveLength(1);

      // Citizen B attempting to read Citizen A's export gets 404 NOT_FOUND + denied audit_event
      await request(app.getHttpServer())
        .get(`/api/v1/me/data-exports/${exportId}`)
        .set('Authorization', `Bearer ${citizenBToken}`)
        .expect(404);

      // Account deletion request marks account pending_deletion and blocks subsequent requests with 403
      const delRes = await request(app.getHttpServer())
        .post('/api/v1/me/account-deletion-requests')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .send({ confirm: true })
        .expect(201);

      expect(delRes.body.data.account_status).toBe(AccountStatus.pending_deletion);

      const blockedRes = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .expect(403);
      expect(blockedRes.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('4. Consent Lifecycle, Idempotency, and Cross-User 404 Isolation', () => {
    it('supports idempotent consent grant, 409 on Idempotency-Key payload mismatch, withdrawal, and 404 on cross-user withdraw', async () => {
      const citizenAToken = await signSyntheticTestJwt({
        subject: 'syn-consent-citizen-a',
      });
      const citizenBToken = await signSyntheticTestJwt({
        subject: 'syn-consent-citizen-b',
      });

      const meA = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .expect(200);
      const userAId: string = meA.body.data.id;

      const meB = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${citizenBToken}`)
        .expect(200);
      const userBId: string = meB.body.data.id;

      const purposesRes = await request(app.getHttpServer())
        .get('/api/v1/me/consent-purposes')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .expect(200);
      expect(purposesRes.body.data).toHaveLength(9);

      // Grant consent with Idempotency-Key
      const firstGrant = await request(app.getHttpServer())
        .post('/api/v1/me/consents')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .set('Idempotency-Key', 'idem-consent-key-01')
        .send({ purpose_code: 'health_input_storage', version: 'v1' })
        .expect(201);

      const consentIdA: string = firstGrant.body.data.id;
      expect(firstGrant.body.data.status).toBe(ConsentRecordStatus.granted);

      // Exact retry with same Idempotency-Key and same body returns same record without duplicating DB rows
      const retryGrant = await request(app.getHttpServer())
        .post('/api/v1/me/consents')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .set('Idempotency-Key', 'idem-consent-key-01')
        .send({ purpose_code: 'health_input_storage', version: 'v1' })
        .expect(201);

      expect(retryGrant.body.data.id).toBe(consentIdA);
      const countForA = await prisma.consentRecord.count({
        where: { userAccountId: userAId },
      });
      expect(countForA).toBe(1);

      // Reusing same Idempotency-Key with DIFFERENT request payload throws 409 CONFLICT
      const mismatchRes = await request(app.getHttpServer())
        .post('/api/v1/me/consents')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .set('Idempotency-Key', 'idem-consent-key-01')
        .send({ purpose_code: 'preventive_risk_calculation', version: 'v1' })
        .expect(409);
      expect(mismatchRes.body.error.code).toBe('CONFLICT');

      // Grant Citizen B's consent
      const grantB = await request(app.getHttpServer())
        .post('/api/v1/me/consents')
        .set('Authorization', `Bearer ${citizenBToken}`)
        .send({ purpose_code: 'health_input_storage', version: 'v1' })
        .expect(201);
      const consentIdB: string = grantB.body.data.id;

      // Citizen A attempting to withdraw Citizen B's consent MUST get 404 NOT_FOUND + denied audit_event
      const crossWithdraw = await request(app.getHttpServer())
        .post(`/api/v1/me/consents/${consentIdB}/withdraw`)
        .set('Authorization', `Bearer ${citizenAToken}`)
        .expect(404);
      expect(crossWithdraw.body.error.code).toBe('NOT_FOUND');

      const stillActiveB = await consentService.verifyActiveConsent(
        userBId,
        'health_input_storage',
        'v1',
      );
      expect(stillActiveB?.id).toBe(consentIdB);

      const deniedAudit = await prisma.auditEvent.findFirst({
        where: {
          actorId: userAId,
          action: 'consent.withdraw',
          resourceId: consentIdB,
          outcome: AuditOutcome.denied,
        },
      });
      expect(deniedAudit).not.toBeNull();

      // Processing-time consent verification & withdrawal for Citizen A
      const activeA = await consentService.requireActiveConsent(
        userAId,
        'health_input_storage',
        'v1',
      );
      expect(activeA.id).toBe(consentIdA);

      const withdrawARes = await request(app.getHttpServer())
        .post(`/api/v1/me/consents/${consentIdA}/withdraw`)
        .set('Authorization', `Bearer ${citizenAToken}`)
        .expect(200);
      expect(withdrawARes.body.data.status).toBe(ConsentRecordStatus.withdrawn);
      expect(withdrawARes.body.data.withdrawn_at).toEqual(expect.any(String));

      await expect(
        consentService.requireActiveConsent(userAId, 'health_input_storage', 'v1'),
      ).rejects.toThrow(ConsentRequiredException);

      // Grant a second consent for Citizen A and verify cursor pagination on GET /api/v1/me/consents
      await request(app.getHttpServer())
        .post('/api/v1/me/consents')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .send({ purpose_code: 'preventive_risk_calculation', version: 'v1' })
        .expect(201);

      const page1 = await request(app.getHttpServer())
        .get('/api/v1/me/consents?limit=1')
        .set('Authorization', `Bearer ${citizenAToken}`)
        .expect(200);
      expect(page1.body.data).toHaveLength(1);
      expect(page1.body.meta.pagination.next_cursor).toEqual(expect.any(String));

      const page2 = await request(app.getHttpServer())
        .get(
          `/api/v1/me/consents?limit=1&cursor=${encodeURIComponent(page1.body.meta.pagination.next_cursor)}`,
        )
        .set('Authorization', `Bearer ${citizenAToken}`)
        .expect(200);
      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.data[0].id).not.toBe(page1.body.data[0].id);
    });
  });

  describe('5. Redis RateLimitGuard & AccessPolicyService Provider Relationship Matrix', () => {
    it('enforces Redis-backed @RateLimit returning 429 RATE_LIMITED when exceeded', async () => {
      await request(app.getHttpServer()).get('/api/v1/rate-limit-probe').expect(200);
      await request(app.getHttpServer()).get('/api/v1/rate-limit-probe').expect(200);
      const blocked = await request(app.getHttpServer())
        .get('/api/v1/rate-limit-probe')
        .expect(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
      expect(blocked.headers['retry-after']).toBeDefined();
    });

    it('enforces all 6 conditions of verifyProviderAccessToCitizen and immediately revokes access on consent withdrawal', async () => {
      const adminToken = await signSyntheticTestJwt({ subject: 'syn-pol-admin' });
      const providerToken = await signSyntheticTestJwt({ subject: 'syn-pol-provider' });
      const citizenToken = await signSyntheticTestJwt({ subject: 'syn-pol-citizen' });

      const adminMe = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await promoteToPlatformAdmin(adminMe.body.data.id);

      const providerMe = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);
      const providerId: string = providerMe.body.data.id;

      const citizenMe = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      const citizenId: string = citizenMe.body.data.id;

      // Grant provider role, create organization & membership, and create scoped assignment via Admin API
      await request(app.getHttpServer())
        .post(`/api/v1/admin/accounts/${providerId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role_code: RoleCode.provider })
        .expect(201);

      const orgRes = await request(app.getHttpServer())
        .post('/api/v1/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Synthetic Kigali District Health Network',
          organization_type: 'hospital_network',
        })
        .expect(201);
      const orgId: string = orgRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/admin/organizations/${orgId}/memberships`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_account_id: providerId,
          role_code: RoleCode.provider,
        })
        .expect(201);

      const assignRes = await request(app.getHttpServer())
        .post('/api/v1/admin/provider-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          provider_user_id: providerId,
          citizen_user_id: citizenId,
          organization_id: orgId,
          allowed_scopes: ['risk_assessments:read', 'follow_ups:write'],
        })
        .expect(201);
      const assignmentId: string = assignRes.body.data.id;

      const providerPrincipal = {
        userAccountId: providerId,
        identitySubjectId: 'syn-id-subj',
        externalSubjectId: 'syn-pol-provider',
        accountStatus: AccountStatus.active,
        roles: [RoleCode.citizen, RoleCode.provider],
      };

      // 1. Before citizen grants provider_data_sharing -> 404 NOT_FOUND + denied audit_event
      await expect(
        accessPolicy.verifyProviderAccessToCitizen({
          principal: providerPrincipal,
          citizenUserId: citizenId,
          requiredScope: 'risk_assessments:read',
        }),
      ).rejects.toThrow(ResourceNotFoundException);

      // 2. Citizen grants provider_data_sharing consent -> access succeeds!
      const sharingConsentRes = await request(app.getHttpServer())
        .post('/api/v1/me/consents')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ purpose_code: 'provider_data_sharing', version: 'v1' })
        .expect(201);
      const sharingConsentId: string = sharingConsentRes.body.data.id;

      const verified = await accessPolicy.verifyProviderAccessToCitizen({
        principal: providerPrincipal,
        citizenUserId: citizenId,
        requiredScope: 'risk_assessments:read',
      });
      expect(verified.assignment.id).toBe(assignmentId);

      // 3. Out-of-scope operation ('health_inputs:read' not in allowed_scopes) -> 404 NOT_FOUND
      await expect(
        accessPolicy.verifyProviderAccessToCitizen({
          principal: providerPrincipal,
          citizenUserId: citizenId,
          requiredScope: 'health_inputs:read',
        }),
      ).rejects.toThrow(ResourceNotFoundException);

      // 4. Feature flag kill switch disabled -> 503 FEATURE_DISABLED
      jest.spyOn(configService, 'featureProviderPortalEnabled', 'get').mockReturnValueOnce(false);
      await expect(
        accessPolicy.verifyProviderAccessToCitizen({
          principal: providerPrincipal,
          citizenUserId: citizenId,
          requiredScope: 'risk_assessments:read',
        }),
      ).rejects.toThrow(FeatureDisabledException);

      // 5. Citizen withdraws provider_data_sharing -> immediate 404 NOT_FOUND on next request!
      await request(app.getHttpServer())
        .post(`/api/v1/me/consents/${sharingConsentId}/withdraw`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);

      await expect(
        accessPolicy.verifyProviderAccessToCitizen({
          principal: providerPrincipal,
          citizenUserId: citizenId,
          requiredScope: 'risk_assessments:read',
        }),
      ).rejects.toThrow(ResourceNotFoundException);

      // 6. Re-grant consent, then end organization membership -> 404 NOT_FOUND
      await request(app.getHttpServer())
        .post('/api/v1/me/consents')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ purpose_code: 'provider_data_sharing', version: 'v1' })
        .expect(201);

      await prisma.organizationMembership.updateMany({
        where: { organizationId: orgId, userAccountId: providerId },
        data: { status: MembershipStatus.ended, endedAt: new Date() },
      });

      await expect(
        accessPolicy.verifyProviderAccessToCitizen({
          principal: providerPrincipal,
          citizenUserId: citizenId,
          requiredScope: 'risk_assessments:read',
        }),
      ).rejects.toThrow(ResourceNotFoundException);

      // Update assignment status via Admin API
      const endedAssign = await request(app.getHttpServer())
        .patch(`/api/v1/admin/provider-assignments/${assignmentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: AssignmentStatus.ended })
        .expect(200);
      expect(endedAssign.body.data.status).toBe(AssignmentStatus.ended);
    });
  });

  describe('6. Admin Separation of Duties, Zero Health-Field Leakage & Redacted Audit Log Access', () => {
    it('prevents admin self-grant of provider/CHW roles, hides citizen health data, audits audit-log reads, and persists zero secrets or health values in audit_events', async () => {
      const adminToken = await signSyntheticTestJwt({
        subject: 'syn-sec-admin-01',
      });
      const citizenToken = await signSyntheticTestJwt({
        subject: 'syn-sec-citizen-01',
      });

      const adminMe = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const adminId: string = adminMe.body.data.id;
      await promoteToPlatformAdmin(adminId, false);

      const citizenMe = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);
      const citizenId: string = citizenMe.body.data.id;

      // Citizen cannot access /api/v1/admin/*
      await request(app.getHttpServer())
        .get('/api/v1/admin/accounts')
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(403);

      // Seed a synthetic health input on the citizen account to prove admin views NEVER expose it
      const storageConsent = await request(app.getHttpServer())
        .post('/api/v1/me/consents')
        .set('Authorization', `Bearer ${citizenToken}`)
        .send({ purpose_code: 'health_input_storage', version: 'v1' })
        .expect(201);

      const sensitiveTobaccoMarker = 'SYNTHETIC_SENSITIVE_HEALTH_MARKER_DO_NOT_LEAK';
      await prisma.healthInput.create({
        data: {
          userAccountId: citizenId,
          category: HealthInputCategory.lifestyle,
          fieldCode: 'tobacco_use_status',
          textValue: sensitiveTobaccoMarker,
          observedAt: new Date(),
          sourceType: DataSourceType.self_reported,
          status: HealthInputStatus.active,
          consentRecordId: storageConsent.body.data.id,
        },
      });

      // Admin cannot call citizen-only consent endpoints when holding only platform_admin role
      await request(app.getHttpServer())
        .get('/api/v1/me/consents')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);

      // Separation of duties: Admin CANNOT grant themselves provider or community_health_worker role
      const selfProviderRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/accounts/${adminId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role_code: RoleCode.provider })
        .expect(403);
      expect(selfProviderRes.body.error.code).toBe('FORBIDDEN');

      const selfChwRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/accounts/${adminId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role_code: RoleCode.community_health_worker })
        .expect(403);
      expect(selfChwRes.body.error.code).toBe('FORBIDDEN');

      // Admin accounts list returns ONLY safe administrative metadata (zero health fields, zero profile PII)
      const accountsRes = await request(app.getHttpServer())
        .get('/api/v1/admin/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const accountsJson = JSON.stringify(accountsRes.body);
      expect(accountsJson).not.toContain(sensitiveTobaccoMarker);
      expect(accountsJson).not.toContain('health_inputs');
      expect(accountsJson).not.toContain('birth_year');
      expect(accountsJson).not.toContain('external_subject_id');

      // Admin can suspend and reactivate citizen account; suspended citizen gets 403
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/accounts/${citizenId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ account_status: AccountStatus.suspended })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/accounts/${citizenId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ account_status: AccountStatus.active })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${citizenToken}`)
        .expect(200);

      // Admin governance catalogs (consent-purposes & rule-versions)
      const adminPurposes = await request(app.getHttpServer())
        .get('/api/v1/admin/consent-purposes')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(adminPurposes.body.data).toHaveLength(9);

      const adminRules = await request(app.getHttpServer())
        .get('/api/v1/admin/rule-versions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(adminRules.body.data).toHaveLength(5);

      // Admin audit-log read writes an admin.audit_events.read audit event!
      const auditReadRes = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-events?limit=25')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(auditReadRes.body.data.length).toBeGreaterThan(0);
      const readAuditRow = await prisma.auditEvent.findFirst({
        where: {
          actorId: adminId,
          action: 'admin.audit_events.read',
          outcome: AuditOutcome.allowed,
        },
      });
      expect(readAuditRow).not.toBeNull();

      // Filter audit events by outcome=denied
      const deniedEventsRes = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-events?outcome=denied')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(deniedEventsRes.body.data.length).toBeGreaterThanOrEqual(2);
      for (const item of deniedEventsRes.body.data) {
        expect(item.outcome).toBe(AuditOutcome.denied);
      }

      // Inspect ALL persisted audit_events and captured Pino logs for zero token/secret/health leaks
      const allAuditRows = await prisma.auditEvent.findMany();
      const serializedAudits = JSON.stringify(allAuditRows);
      expect(serializedAudits).not.toContain(adminToken);
      expect(serializedAudits).not.toContain(citizenToken);
      expect(serializedAudits).not.toContain(SYNTHETIC_TEST_ENV.JWT_HS256_SECRET);
      expect(serializedAudits).not.toContain(sensitiveTobaccoMarker);

      const combinedLogs = capturedLogs.join('\n');
      expect(combinedLogs).not.toContain(adminToken);
      expect(combinedLogs).not.toContain(citizenToken);
      expect(combinedLogs).not.toContain(sensitiveTobaccoMarker);
    });
  });
});
