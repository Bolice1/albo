import 'reflect-metadata';
import {
  Body,
  Controller,
  Get,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  Post,
  Query,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { IsInt, IsString, Max, Min } from 'class-validator';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import request from 'supertest';
import { AppConfigModule } from '@config/app-config.module';
import { AppConfigService } from '@config/app-config.service';
import { validateEnv } from '@config/env.schema';
import {
  RequestContextModule,
  RequestContextService,
} from '@common/context/request-context.service';
import { Public } from '@common/decorators/public.decorator';
import { SkipEnvelope } from '@common/decorators/skip-envelope.decorator';
import {
  DependencyUnavailableException,
  FeatureDisabledException,
  GlobalExceptionFilter,
  MalformedRequestException,
  ValidationDomainException,
  createRedactedValidationPipe,
} from '@common/errors';
import {
  CursorPaginationQueryDto,
  decodeCursor,
  encodeCursor,
  EnvelopeInterceptor,
  paginateItems,
} from '@common/http';
import { LoggingModule, sanitizeMetadata } from '@common/logging';
import {
  REQUEST_ID_RESPONSE_HEADER,
  RequestIdMiddleware,
  resolveSafeRequestId,
} from '@common/middleware/request-id.middleware';
import { assertNonProduction, constantTimeEquals, sha256Json } from '@common/utils';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@database/redis.service';
import {
  AiServiceClient,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from '@integrations/ai-service/ai-service.client';
import { signSyntheticTestJwt } from '@integrations/identity/oidc-jwt-verifier.service';
import { configureHttpApplication } from '../../src/bootstrap';
import { HealthController } from '../../src/health/health.controller';
import { applySyntheticTestEnv, SYNTHETIC_TEST_ENV } from '../helpers/test-env.helper';

class SyntheticInputTestDto {
  @IsInt()
  @Min(0)
  @Max(5040)
  physical_activity_minutes_per_week!: number;

  @IsString()
  tobacco_use_status!: string;
}

@Public()
@Controller('foundation-probe')
class FoundationProbeController {
  @Get('single')
  getSingle() {
    return { ok: true };
  }

  @Get('paginated')
  getPaginated(@Query() query: CursorPaginationQueryDto) {
    const rows = [
      { id: 'row-1', created_at: '2026-11-24T10:00:00.000Z' },
      { id: 'row-2', created_at: '2026-11-24T09:00:00.000Z' },
      { id: 'row-3', created_at: '2026-11-24T08:00:00.000Z' },
    ];
    return paginateItems(rows, query.limit ?? 2, (r) => ({
      id: r.id,
      sortValue: r.created_at,
    }));
  }

  @Get('raw')
  @SkipEnvelope()
  getRaw() {
    return { raw_payload: 'unwrapped' };
  }

  @Post('validate')
  postValidate(@Body() dto: SyntheticInputTestDto) {
    return { accepted_field: dto.tobacco_use_status };
  }

  @Get('crash-sql')
  getCrashSql() {
    throw new Error(
      'SELECT numeric_value FROM health_inputs WHERE secret_token = "SUPER_SECRET_DB_LEAK"',
    );
  }

  @Get('prisma-conflict')
  getPrismaConflict() {
    throw new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`user_account_id`,`secret_col`)',
      {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['user_account_id', 'secret_col'] },
      },
    );
  }
}

describe('Phase 1B Core Foundation Plumbing (Unit & Isolated HTTP)', () => {
  beforeEach(() => {
    applySyntheticTestEnv();
  });

  describe('Startup Environment Validation (env.schema.ts & AppConfigService)', () => {
    it('accepts valid synthetic configuration and parses rule versions & feature flags', () => {
      const validated = validateEnv({
        ...SYNTHETIC_TEST_ENV,
        FEATURE_PROVIDER_PORTAL_ENABLED: 'true',
        APPROVED_RISK_RULE_VERSIONS:
          'lifestyle_ncd_preventive:rules-v1.0.0, malaria_exposure_preventive:rules-v0.1.0-draft',
      });

      expect(validated.NODE_ENV).toBe('test');
      expect(validated.PORT).toBe(4010);
      expect(validated.FEATURE_PROVIDER_PORTAL_ENABLED).toBe(true);
      expect(validated.FEATURE_ASSISTANT_ENABLED).toBe(false);
    });

    it('fails fast on missing/invalid required env vars without echoing raw secret values', () => {
      const leakedCandidateSecret = 'short_secret_12345';
      expect(() =>
        validateEnv({
          ...SYNTHETIC_TEST_ENV,
          DATABASE_URL: 'mysql://wrong-driver/db',
          REDIS_URL: 'http://not-redis',
          AI_SERVICE_TOKEN: leakedCandidateSecret,
        }),
      ).toThrow(/Invalid environment configuration/);

      try {
        validateEnv({
          ...SYNTHETIC_TEST_ENV,
          AI_SERVICE_TOKEN: leakedCandidateSecret,
        });
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain('AI_SERVICE_TOKEN');
        expect(message).not.toContain(leakedCandidateSecret);
      }
    });

    it('enforces production JWT and S3 credential requirements and fails fast during AppConfigModule boot', async () => {
      expect(() =>
        validateEnv({
          ...SYNTHETIC_TEST_ENV,
          NODE_ENV: 'production',
          JWT_HS256_SECRET: '',
          JWT_JWKS_URL: '',
          S3_ACCESS_KEY: '',
          S3_SECRET_KEY: '',
        }),
      ).toThrow(/Production requires/);

      const prevToken = process.env.AI_SERVICE_TOKEN;
      process.env.AI_SERVICE_TOKEN = 'short-token';
      try {
        await expect(
          Test.createTestingModule({
            imports: [AppConfigModule],
          }).compile(),
        ).rejects.toThrow(/Invalid environment configuration/);
      } finally {
        process.env.AI_SERVICE_TOKEN = prevToken;
      }
    });
  });

  describe('Non-Production Guards & Crypto Utilities', () => {
    it('blocks synthetic test helpers when NODE_ENV is production', async () => {
      expect(() => assertNonProduction('seedSyntheticBaseline', 'production')).toThrow(
        /prohibited when NODE_ENV is "production"/,
      );

      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await expect(signSyntheticTestJwt({ subject: 'syn-user-1' })).rejects.toThrow(
          /prohibited when NODE_ENV is "production"/,
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('computes key-order-independent SHA-256 JSON digests and constant-time comparisons', () => {
      const hashA = sha256Json({ b: 2, a: 'hello', nested: { z: true, y: [1, 2] } });
      const hashB = sha256Json({ nested: { y: [1, 2], z: true }, a: 'hello', b: 2 });
      const hashC = sha256Json({ b: 3, a: 'hello', nested: { z: true, y: [1, 2] } });

      expect(hashA).toBe(hashB);
      expect(hashA).not.toBe(hashC);

      expect(constantTimeEquals('token-alpha-123', 'token-alpha-123')).toBe(true);
      expect(constantTimeEquals('token-alpha-123', 'token-alpha-124')).toBe(false);
      expect(constantTimeEquals('short', 'longer-string-value')).toBe(false);
    });

    it('redacts sensitive health, location, PII, and bearer token fields in sanitizeMetadata', () => {
      const sanitized = sanitizeMetadata({
        safe_count: 3,
        numeric_value: 180,
        numericValue: 180,
        user_message: 'I have a severe headache',
        latitude: -1.9441,
        longitude: 30.0619,
        displayName: 'Synthetic Citizen',
        leaked_jwt: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
      });

      expect(sanitized.safe_count).toBe(3);
      expect(sanitized.numeric_value).toBe('[REDACTED]');
      expect(sanitized.numericValue).toBe('[REDACTED]');
      expect(sanitized.user_message).toBe('[REDACTED]');
      expect(sanitized.latitude).toBe('[REDACTED]');
      expect(sanitized.longitude).toBe('[REDACTED]');
      expect(sanitized.displayName).toBe('[REDACTED]');
      expect(sanitized.leaked_jwt).toBe('[REDACTED]');
    });
  });

  describe('Cursor Pagination & Request-ID Sanitization Helpers', () => {
    it('encodes and decodes valid cursors and throws 400 MALFORMED_REQUEST on invalid cursors', () => {
      const cursor = encodeCursor({
        id: '89f8207a-4989-4100-965f-94f26b3fd549',
        sortValue: '2026-11-25T00:00:00.000Z',
      });
      expect(decodeCursor(cursor)).toEqual({
        id: '89f8207a-4989-4100-965f-94f26b3fd549',
        sortValue: '2026-11-25T00:00:00.000Z',
      });

      expect(() => decodeCursor('not-valid-json-base64!!!')).toThrow(MalformedRequestException);
      expect(() =>
        decodeCursor(Buffer.from(JSON.stringify({ id: '' })).toString('base64url')),
      ).toThrow(MalformedRequestException);
    });

    it('accepts safe opaque request IDs and replaces unsafe or oversized IDs with UUIDs', () => {
      expect(resolveSafeRequestId('req_2026-11.valid-01')).toBe('req_2026-11.valid-01');
      const unsafeReplaced = resolveSafeRequestId('unsafe id with spaces <script> & bearer secret');
      expect(unsafeReplaced).not.toContain('unsafe');
      expect(unsafeReplaced).toMatch(/^[0-9a-f-]{36}$/i);

      const oversizedReplaced = resolveSafeRequestId('a'.repeat(129));
      expect(oversizedReplaced).toMatch(/^[0-9a-f-]{36}$/i);
    });
  });

  describe('HTTP Envelope, Error Filter, DTO Value Redaction, Pino Log Redaction & Health Probes', () => {
    let app: INestApplication;
    const logLines: string[] = [];
    const mockPrisma = {
      checkReady: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    };
    const mockRedis = {
      ping: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    };
    const mockAiClient = {
      checkHealth: jest.fn().mockResolvedValue({
        status: 'ok',
        service: 'albo-ai-services',
        loaded_rule_versions: ['lifestyle_ncd_preventive:rules-v1.0.0'],
        assistant_enabled: false,
        request_id: 'req-ai-health',
      }),
    };

    beforeAll(async () => {
      const logStream = new Writable({
        write(chunk, _encoding, callback) {
          const text = chunk.toString('utf8');
          for (const line of text.split('\n')) {
            if (line.trim()) {
              logLines.push(line.trim());
            }
          }
          callback();
        },
      });

      @Module({
        imports: [AppConfigModule, RequestContextModule, LoggingModule.register(logStream)],
        controllers: [FoundationProbeController, HealthController],
        providers: [
          { provide: PrismaService, useValue: mockPrisma },
          { provide: RedisService, useValue: mockRedis },
          { provide: AiServiceClient, useValue: mockAiClient },
          { provide: APP_FILTER, useClass: GlobalExceptionFilter },
          { provide: APP_PIPE, useFactory: () => createRedactedValidationPipe() },
          { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
        ],
      })
      class ProbeAppModule implements NestModule {
        configure(consumer: MiddlewareConsumer): void {
          consumer.apply(RequestIdMiddleware).forRoutes('*');
        }
      }

      const moduleRef = await Test.createTestingModule({
        imports: [ProbeAppModule],
      }).compile();

      app = moduleRef.createNestApplication({ bufferLogs: true });
      configureHttpApplication(app);
      await app.init();
    });

    afterAll(async () => {
      if (app) {
        await app.close();
      }
    });

    beforeEach(() => {
      logLines.length = 0;
      mockPrisma.checkReady.mockResolvedValue(true);
      mockRedis.ping.mockResolvedValue(true);
      mockAiClient.checkHealth.mockResolvedValue({
        status: 'ok',
        service: 'albo-ai-services',
        loaded_rule_versions: ['lifestyle_ncd_preventive:rules-v1.0.0'],
        assistant_enabled: false,
        request_id: 'req-ai-health',
      });
    });

    it('echoes safe X-Request-Id and replaces unsafe X-Request-Id across headers and envelopes', async () => {
      const safeRes = await request(app.getHttpServer())
        .get('/api/v1/foundation-probe/single')
        .set('X-Request-Id', 'client-req-safe-001')
        .expect(200);

      expect(safeRes.headers[REQUEST_ID_RESPONSE_HEADER.toLowerCase()]).toBe('client-req-safe-001');
      expect(safeRes.body).toEqual({
        data: { ok: true },
        meta: { request_id: 'client-req-safe-001' },
      });

      const unsafeRes = await request(app.getHttpServer())
        .get('/api/v1/foundation-probe/single')
        .set('X-Request-Id', 'bad<script>request id with spaces')
        .expect(200);

      const generatedId = unsafeRes.headers[REQUEST_ID_RESPONSE_HEADER.toLowerCase()];
      expect(generatedId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(unsafeRes.body.meta.request_id).toBe(generatedId);
    });

    it('wraps paginated responses with meta.pagination and honors @SkipEnvelope()', async () => {
      const pagRes = await request(app.getHttpServer())
        .get('/api/v1/foundation-probe/paginated?limit=2')
        .expect(200);

      expect(pagRes.body.data).toHaveLength(2);
      expect(pagRes.body.meta.pagination.limit).toBe(2);
      expect(typeof pagRes.body.meta.pagination.next_cursor).toBe('string');

      const rawRes = await request(app.getHttpServer())
        .get('/api/v1/foundation-probe/raw')
        .expect(200);
      expect(rawRes.body).toEqual({ raw_payload: 'unwrapped' });
    });

    it('redacts submitted values in 422 validation errors and strips tokens/bodies/queries from Pino logs', async () => {
      const secretToken = 'SYNTHETIC_SUPER_SECRET_BEARER_TOKEN_999';
      const secretCookie = 'SYNTHETIC_SESSION_COOKIE_888';
      const sensitiveHealthValue = 999888777;
      const unwhitelistedNote = 'MY_RAW_CLINICAL_NOTE_DO_NOT_LOG';
      const sensitiveQueryValue = 'acute_chest_symptom_query';

      const res = await request(app.getHttpServer())
        .post(`/api/v1/foundation-probe/validate?symptom=${sensitiveQueryValue}`)
        .set('Authorization', `Bearer ${secretToken}`)
        .set('Cookie', `session=${secretCookie}`)
        .set('X-Request-Id', 'req-redaction-check')
        .send({
          physical_activity_minutes_per_week: sensitiveHealthValue,
          tobacco_use_status: 12345,
          unapproved_clinical_note: unwhitelistedNote,
        })
        .expect(422);

      expect(res.body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request contains invalid fields.',
          details: expect.arrayContaining([
            {
              field: 'unapproved_clinical_note',
              reason: 'unknown_field',
            },
            {
              field: 'physical_activity_minutes_per_week',
              reason: 'above_maximum',
            },
            {
              field: 'tobacco_use_status',
              reason: 'invalid_string',
            },
          ]),
          request_id: 'req-redaction-check',
        },
      });

      const serializedResponse = JSON.stringify(res.body);
      expect(serializedResponse).not.toContain(String(sensitiveHealthValue));
      expect(serializedResponse).not.toContain(unwhitelistedNote);

      const combinedLogs = logLines.join('\n');
      expect(combinedLogs).toContain('req-redaction-check');
      expect(combinedLogs).not.toContain(secretToken);
      expect(combinedLogs).not.toContain(secretCookie);
      expect(combinedLogs).not.toContain(String(sensitiveHealthValue));
      expect(combinedLogs).not.toContain(unwhitelistedNote);
      expect(combinedLogs).not.toContain(sensitiveQueryValue);
    });

    it('maps 404, Prisma P2002 409, and unexpected 500 errors to API §6 without stack traces or SQL leaks', async () => {
      const notFoundRes = await request(app.getHttpServer())
        .get('/api/v1/non-existent-endpoint')
        .set('X-Request-Id', 'req-404')
        .expect(404);
      expect(notFoundRes.body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          details: [],
          request_id: 'req-404',
        },
      });

      const conflictRes = await request(app.getHttpServer())
        .get('/api/v1/foundation-probe/prisma-conflict')
        .set('X-Request-Id', 'req-409')
        .expect(409);
      expect(conflictRes.body.error.code).toBe('CONFLICT');
      expect(JSON.stringify(conflictRes.body)).not.toContain('secret_col');
      expect(JSON.stringify(conflictRes.body)).not.toContain('P2002');

      const crashRes = await request(app.getHttpServer())
        .get('/api/v1/foundation-probe/crash-sql')
        .set('X-Request-Id', 'req-500')
        .expect(500);
      expect(crashRes.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected internal error occurred.',
          details: [],
          request_id: 'req-500',
        },
      });

      const crashSerialized = JSON.stringify(crashRes.body);
      expect(crashSerialized).not.toContain('SUPER_SECRET_DB_LEAK');
      expect(crashSerialized).not.toContain('health_inputs');
      expect(crashSerialized).not.toContain('stack');

      const combinedLogs = logLines.join('\n');
      expect(combinedLogs).not.toContain('SUPER_SECRET_DB_LEAK');
    });

    it('serves /health/live and /health/ready outside /api/v1 and reports 503 when a dependency is down', async () => {
      const liveRes = await request(app.getHttpServer()).get('/health/live').expect(200);
      expect(liveRes.body.data).toEqual({
        status: 'ok',
        service: 'albo-core-api',
      });

      const readyOkRes = await request(app.getHttpServer()).get('/health/ready').expect(200);
      expect(readyOkRes.body.data).toEqual({
        status: 'ready',
        service: 'albo-core-api',
        dependencies: {
          postgres: 'up',
          redis: 'up',
          ai_service: 'up',
        },
      });

      mockAiClient.checkHealth.mockRejectedValueOnce(new DependencyUnavailableException());
      const readyDegradedRes = await request(app.getHttpServer()).get('/health/ready').expect(503);
      expect(readyDegradedRes.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
      expect(readyDegradedRes.body.error.details).toEqual([
        { field: 'ai_service', reason: 'down' },
      ]);
    });
  });

  describe('AiServiceClient (Timeout, Headers, and Error Mapping)', () => {
    let stubServer: Server;
    let stubBaseUrl: string;
    let routeHandler: (req: IncomingMessage, res: ServerResponse) => void;

    beforeAll(async () => {
      stubServer = createServer((req, res) => {
        routeHandler(req, res);
      });
      await new Promise<void>((resolve) => {
        stubServer.listen(0, '127.0.0.1', () => resolve());
      });
      const addr = stubServer.address() as AddressInfo;
      stubBaseUrl = `http://127.0.0.1:${addr.port}`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve, reject) => {
        stubServer.close((err) => (err ? reject(err) : resolve()));
      });
    });

    function buildClient(timeoutMs = 150): AiServiceClient {
      const fakeConfig = {
        aiServiceUrl: stubBaseUrl,
        aiServiceToken: SYNTHETIC_TEST_ENV.AI_SERVICE_TOKEN,
        aiServiceTimeoutMs: timeoutMs,
      } as unknown as AppConfigService;
      const ctxService = new RequestContextService();
      return new AiServiceClient(fakeConfig, ctxService);
    }

    it('propagates X-Internal-Service-Token and X-Request-Id on /internal/v1 calls', async () => {
      let receivedToken: string | string[] | undefined;
      let receivedReqId: string | string[] | undefined;

      routeHandler = (req, res) => {
        receivedToken = req.headers[INTERNAL_SERVICE_TOKEN_HEADER.toLowerCase()];
        receivedReqId = req.headers['x-request-id'];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            service: 'albo-ai-services',
            loaded_rule_versions: ['lifestyle_ncd_preventive:rules-v1.0.0'],
            assistant_enabled: false,
            request_id: String(receivedReqId),
          }),
        );
      };

      const client = buildClient();
      const result = await RequestContextService.run({ requestId: 'req-prop-777' }, () =>
        client.checkHealth(),
      );

      expect(receivedToken).toBe(SYNTHETIC_TEST_ENV.AI_SERVICE_TOKEN);
      expect(receivedReqId).toBe('req-prop-777');
      expect(result.status).toBe('ok');
    });

    it('maps slow upstream timeouts to DependencyUnavailableException (503)', async () => {
      routeHandler = (_req, res) => {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        }, 300);
      };

      const client = buildClient(60);
      await expect(client.checkHealth()).rejects.toThrow(DependencyUnavailableException);
    });

    it('maps upstream 422 to ValidationDomainException and 503 FEATURE_DISABLED to FeatureDisabledException', async () => {
      routeHandler = (_req, res) => {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Unknown rule version.',
              details: [{ field: 'rule_model_version', reason: 'unknown_version' }],
              request_id: 'req-422',
            },
          }),
        );
      };

      const client = buildClient();
      await expect(
        client.calculateRiskAssessment({
          use_case_code: 'lifestyle_ncd_preventive',
          rule_model_version: 'rules-v9.9.9',
          input_snapshot_id: 'snap-1',
          calculated_for_timestamp: '2026-11-25T00:00:00.000Z',
          authorization_context: {
            consent_verified: true,
            consent_purpose_code: 'preventive_risk_calculation',
            consent_version: 'v1',
          },
          inputs: { health_inputs: [], environmental_observations: [] },
        }),
      ).rejects.toThrow(ValidationDomainException);

      routeHandler = (_req, res) => {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              code: 'FEATURE_DISABLED',
              message: 'Assistant disabled.',
              details: [],
              request_id: 'req-503',
            },
          }),
        );
      };

      await expect(
        client.respondAssistant({
          conversation_id: 'conv-1',
          authorization_context: {
            consent_verified: true,
            consent_purpose_code: 'assistant_conversations',
            consent_version: 'v1',
          },
          user_message: 'Explain my indicator',
        }),
      ).rejects.toThrow(FeatureDisabledException);
    });
  });
});
