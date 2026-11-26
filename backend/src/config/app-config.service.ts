import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ValidatedEnv } from './env.schema';

@Injectable()
export class AppConfigService {
  private readonly approvedRuleMap: ReadonlyMap<string, ReadonlySet<string>>;

  constructor(private readonly configService: ConfigService<ValidatedEnv, true>) {
    this.approvedRuleMap = this.parseApprovedRuleVersions(
      this.configService.get('APPROVED_RISK_RULE_VERSIONS', { infer: true }),
    );
  }

  get nodeEnv(): ValidatedEnv['NODE_ENV'] {
    return this.configService.get('NODE_ENV', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  get port(): number {
    return this.configService.get('PORT', { infer: true });
  }

  get databaseUrl(): string {
    return this.configService.get('DATABASE_URL', { infer: true });
  }

  get redisUrl(): string {
    return this.configService.get('REDIS_URL', { infer: true });
  }

  get aiServiceUrl(): string {
    return this.configService.get('AI_SERVICE_URL', { infer: true });
  }

  get aiServiceToken(): string {
    return this.configService.get('AI_SERVICE_TOKEN', { infer: true });
  }

  get aiServiceTimeoutMs(): number {
    return this.configService.get('AI_SERVICE_TIMEOUT_MS', { infer: true });
  }

  get jwtIssuer(): string {
    return this.configService.get('JWT_ISSUER', { infer: true });
  }

  get jwtAudience(): string {
    return this.configService.get('JWT_AUDIENCE', { infer: true });
  }

  get jwtJwksUrl(): string | undefined {
    return this.configService.get('JWT_JWKS_URL', { infer: true });
  }

  get jwtHs256Secret(): string | undefined {
    return this.configService.get('JWT_HS256_SECRET', { infer: true });
  }

  get s3Endpoint(): string {
    return this.configService.get('S3_ENDPOINT', { infer: true });
  }

  get s3Region(): string {
    return this.configService.get('S3_REGION', { infer: true });
  }

  get s3Bucket(): string {
    return this.configService.get('S3_BUCKET', { infer: true });
  }

  get s3AccessKey(): string | undefined {
    return this.configService.get('S3_ACCESS_KEY', { infer: true });
  }

  get s3SecretKey(): string | undefined {
    return this.configService.get('S3_SECRET_KEY', { infer: true });
  }

  get corsAllowedOrigins(): string[] {
    const raw = this.configService.get('CORS_ALLOWED_ORIGINS', { infer: true });
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  get featureAssistantEnabled(): boolean {
    return this.configService.get('FEATURE_ASSISTANT_ENABLED', { infer: true });
  }

  get featureProviderPortalEnabled(): boolean {
    return this.configService.get('FEATURE_PROVIDER_PORTAL_ENABLED', { infer: true });
  }

  get featureCheckinsEnabled(): boolean {
    return this.configService.get('FEATURE_CHECKINS_ENABLED', { infer: true });
  }

  getApprovedRuleVersions(useCaseCode: string): string[] {
    const versions = this.approvedRuleMap.get(useCaseCode);
    return versions ? Array.from(versions) : [];
  }

  isRuleVersionApproved(useCaseCode: string, version: string): boolean {
    return this.approvedRuleMap.get(useCaseCode)?.has(version) ?? false;
  }

  private parseApprovedRuleVersions(raw: string): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const entry of raw.split(',')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const separatorIndex = trimmed.indexOf(':');
      if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) continue;
      const useCaseCode = trimmed.slice(0, separatorIndex).trim();
      const version = trimmed.slice(separatorIndex + 1).trim();
      if (!useCaseCode || !version) continue;
      const existing = map.get(useCaseCode) ?? new Set<string>();
      existing.add(version);
      map.set(useCaseCode, existing);
    }
    return map;
  }
}
