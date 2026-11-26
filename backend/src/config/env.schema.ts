import { z } from 'zod';

const booleanStringSchema = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val, ctx) => {
      if (val === undefined || val === '') {
        return defaultValue;
      }
      if (typeof val === 'boolean') {
        return val;
      }
      const normalized = val.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return true;
      }
      if (normalized === 'false' || normalized === '0') {
        return false;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Expected boolean ("true", "false", "1", or "0")',
      });
      return z.NEVER;
    });

const optionalNonEmptyString = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z.string().min(1).optional(),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .refine(
        (val) => val.startsWith('postgres://') || val.startsWith('postgresql://'),
        'DATABASE_URL must be a valid PostgreSQL connection string',
      ),

    REDIS_URL: z
      .string()
      .min(1, 'REDIS_URL is required')
      .refine(
        (val) => val.startsWith('redis://') || val.startsWith('rediss://'),
        'REDIS_URL must be a valid Redis connection string',
      ),

    AI_SERVICE_URL: z.string().url('AI_SERVICE_URL must be a valid URL'),
    AI_SERVICE_TOKEN: z.string().min(32, 'AI_SERVICE_TOKEN must be at least 32 characters'),
    AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(50).max(30000).default(2000),

    JWT_ISSUER: z.string().min(1).default('https://auth.synthetic.albo.invalid'),
    JWT_AUDIENCE: z.string().min(1).default('albo-core-api'),
    JWT_JWKS_URL: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().url('JWT_JWKS_URL must be a valid URL').optional(),
    ),
    JWT_HS256_SECRET: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().min(32, 'JWT_HS256_SECRET must be at least 32 characters').optional(),
    ),

    S3_ENDPOINT: z.string().url().default('http://127.0.0.1:9000'),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(1).default('albo-synthetic-reports'),
    S3_ACCESS_KEY: optionalNonEmptyString,
    S3_SECRET_KEY: optionalNonEmptyString,

    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

    FEATURE_ASSISTANT_ENABLED: booleanStringSchema(false),
    FEATURE_PROVIDER_PORTAL_ENABLED: booleanStringSchema(false),
    FEATURE_CHECKINS_ENABLED: booleanStringSchema(false),

    APPROVED_RISK_RULE_VERSIONS: z.string().min(1).default('lifestyle_ncd_preventive:rules-v1.0.0'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.JWT_JWKS_URL && !env.JWT_HS256_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_JWKS_URL'],
          message: 'Production requires JWT_JWKS_URL or JWT_HS256_SECRET',
        });
      }
      if (!env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_ACCESS_KEY'],
          message: 'Production requires S3_ACCESS_KEY and S3_SECRET_KEY',
        });
      }
    }
  });

export type ValidatedEnv = z.infer<typeof envSchema>;

export function validateEnv(rawEnv: Record<string, unknown>): ValidatedEnv {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    // Never include raw secret values in startup configuration failure messages
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
