import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RequestContextService } from '@common/context/request-context.service';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { UnauthenticatedException } from '@common/errors/app.exception';
import { OidcJwtVerifierService } from '@integrations/identity/oidc-jwt-verifier.service';
import { AccountReconciliationService } from '../account-reconciliation.service';

interface RequestWithPrincipal extends Request {
  user?: AuthenticatedPrincipal;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtVerifier: OidcJwtVerifierService,
    private readonly accountReconciliation: AccountReconciliationService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const rawToken = this.extractBearerToken(request.headers.authorization);

    const verifiedIdentity = await this.jwtVerifier.verifyAccessToken(rawToken);
    const principal = await this.accountReconciliation.resolvePrincipal(verifiedIdentity);

    request.user = principal;
    this.requestContext.setActor(principal.userAccountId, principal.roles);

    return true;
  }

  private extractBearerToken(authorizationHeader: unknown): string {
    if (typeof authorizationHeader !== 'string') {
      throw new UnauthenticatedException();
    }
    const trimmed = authorizationHeader.trim();
    if (!/^Bearer\s+/i.test(trimmed)) {
      throw new UnauthenticatedException();
    }
    const token = trimmed.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthenticatedException();
    }
    return token;
  }
}
