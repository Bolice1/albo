import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { AppConfigService } from '@config/app-config.service';
import { UnauthenticatedException } from '@common/errors/app.exception';
import { assertNonProduction } from '@common/utils/environment.util';

export interface VerifiedJwtIdentity {
  externalSubjectId: string;
  issuer: string;
}

export interface SyntheticJwtSignOptions {
  subject: string;
  issuer?: string;
  audience?: string;
  expiresInSeconds?: number;
  secret?: string;
  includeExp?: boolean;
  additionalClaims?: Record<string, unknown>;
}

const DEFAULT_SYNTHETIC_ISSUER = 'https://auth.synthetic.albo.invalid';
const DEFAULT_SYNTHETIC_AUDIENCE = 'albo-core-api';

/**
 * Deterministic offline JWT signer for local development and automated test suites (ADR-011).
 * Strictly disabled when `NODE_ENV === 'production'`.
 */
export async function signSyntheticTestJwt(options: SyntheticJwtSignOptions): Promise<string> {
  assertNonProduction('signSyntheticTestJwt');

  const rawSecret = options.secret ?? process.env.JWT_HS256_SECRET ?? '';
  if (rawSecret.length < 32) {
    throw new Error('signSyntheticTestJwt requires a secret of at least 32 characters.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresInSeconds = options.expiresInSeconds ?? 3600;
  const key = new TextEncoder().encode(rawSecret);

  const builder = new SignJWT({
    ...(options.additionalClaims ?? {}),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(options.subject)
    .setIssuer(options.issuer ?? process.env.JWT_ISSUER ?? DEFAULT_SYNTHETIC_ISSUER)
    .setAudience(options.audience ?? process.env.JWT_AUDIENCE ?? DEFAULT_SYNTHETIC_AUDIENCE)
    .setIssuedAt(nowSeconds);

  if (options.includeExp !== false) {
    builder.setExpirationTime(nowSeconds + expiresInSeconds);
  }

  return builder.sign(key);
}

@Injectable()
export class OidcJwtVerifierService {
  private readonly remoteJwks?: ReturnType<typeof createRemoteJWKSet>;
  private readonly hs256Key?: Uint8Array;

  constructor(private readonly config: AppConfigService) {
    if (this.config.jwtJwksUrl) {
      this.remoteJwks = createRemoteJWKSet(new URL(this.config.jwtJwksUrl));
    }
    if (this.config.jwtHs256Secret) {
      this.hs256Key = new TextEncoder().encode(this.config.jwtHs256Secret);
    }
  }

  async verifyAccessToken(rawToken: string): Promise<VerifiedJwtIdentity> {
    if (!rawToken || rawToken.trim().length === 0 || rawToken.length > 4096) {
      throw new UnauthenticatedException('Invalid or missing access token.');
    }

    try {
      const verifyOptions = {
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
        requiredClaims: ['sub', 'exp', 'iss', 'aud'],
      };

      const verified = this.remoteJwks
        ? await jwtVerify(rawToken, this.remoteJwks, verifyOptions)
        : this.hs256Key
          ? await jwtVerify(rawToken, this.hs256Key, {
              ...verifyOptions,
              algorithms: ['HS256'],
            })
          : null;

      if (!verified) {
        throw new UnauthenticatedException('Authentication verification is not configured.');
      }

      const sub = verified.payload.sub;
      const iss = verified.payload.iss;
      if (
        typeof sub !== 'string' ||
        sub.trim().length === 0 ||
        sub.trim().length > 255 ||
        typeof iss !== 'string' ||
        iss.trim().length === 0
      ) {
        throw new UnauthenticatedException('Token subject claim is invalid.');
      }

      return {
        externalSubjectId: sub.trim(),
        issuer: iss.trim(),
      };
    } catch (err) {
      if (err instanceof UnauthenticatedException) {
        throw err;
      }
      throw new UnauthenticatedException('Invalid or expired access token.');
    }
  }
}
