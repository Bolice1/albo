import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorType, AuditOutcome, RoleCode } from '@prisma/client';
import type { Request } from 'express';
import { AuthenticatedPrincipal } from '@common/decorators/authenticated-principal.interface';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { REQUIRED_ROLES_KEY } from '@common/decorators/require-roles.decorator';
import {
  ForbiddenOperationException,
  UnauthenticatedException,
} from '@common/errors/app.exception';
import { extractSafeRoutePattern } from '@common/logging/logging.module';
import { AuditService } from '@modules/audit/audit.service';

interface RequestWithPrincipal extends Request {
  user?: AuthenticatedPrincipal;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[] | undefined>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request.user;
    if (!principal) {
      throw new UnauthenticatedException();
    }

    const hasRequiredRole = requiredRoles.some((role) => principal.roles.includes(role));

    if (!hasRequiredRole) {
      await this.auditService.record({
        actorId: principal.userAccountId,
        actorType: ActorType.user,
        action: 'authz.role_check',
        resourceType: 'route',
        resourceId: extractSafeRoutePattern(request),
        outcome: AuditOutcome.denied,
        metadata: {
          required_roles: requiredRoles,
          caller_roles: principal.roles,
        },
      });
      throw new ForbiddenOperationException();
    }

    return true;
  }
}
