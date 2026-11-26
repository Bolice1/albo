import { PrismaClient } from '@prisma/client';

export const SYNTHETIC_TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '4010',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/albo_test?schema=public', // ggignore
  REDIS_URL: 'redis://127.0.0.1:6379/1',
  AI_SERVICE_URL: 'http://127.0.0.1:8099',
  AI_SERVICE_TOKEN: 'example_placeholder_internal_service_token_test_only', // ggignore
  AI_SERVICE_TIMEOUT_MS: '1500',
  JWT_ISSUER: 'https://auth.synthetic.albo.invalid',
  JWT_AUDIENCE: 'albo-core-api',
  JWT_HS256_SECRET: 'example_placeholder_jwt_signing_secret_key_test_only', // ggignore
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'albo-synthetic-reports',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin', // ggignore
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  FEATURE_ASSISTANT_ENABLED: 'false',
  FEATURE_PROVIDER_PORTAL_ENABLED: 'false',
  FEATURE_CHECKINS_ENABLED: 'false',
  APPROVED_RISK_RULE_VERSIONS: 'lifestyle_ncd_preventive:rules-v1.0.0',
} as const;

export function applySyntheticTestEnv(
  overrides: Partial<Record<keyof typeof SYNTHETIC_TEST_ENV, string>> = {},
): void {
  const merged = { ...SYNTHETIC_TEST_ENV, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value;
  }
}

/**
 * Truncates mutable domain tables in `albo_test` while respecting the append-only trigger
 * on `audit_events` (`TRUNCATE` does not fire `FOR EACH ROW` triggers in PostgreSQL, keeping
 * the immutability trigger intact while allowing clean isolated test runs).
 */
export async function resetTestDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "idempotency_records",
      "data_export_requests",
      "account_deletion_requests",
      "assistant_turns",
      "assistant_conversations",
      "report_accesses",
      "reports",
      "notifications",
      "notification_preferences",
      "consultations",
      "referrals",
      "provider_follow_ups",
      "provider_assignments",
      "provider_profiles",
      "organization_memberships",
      "organizations",
      "risk_assessments",
      "input_snapshots",
      "environmental_observations",
      "ingestion_records",
      "wellbeing_check_ins",
      "health_inputs",
      "consent_records",
      "user_roles",
      "user_profiles",
      "user_accounts",
      "identity_subjects",
      "audit_events"
    RESTART IDENTITY CASCADE;
  `);
}
