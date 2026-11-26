import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedPrincipal } from './authenticated-principal.interface';
import { UnauthenticatedException } from '../errors/app.exception';

interface RequestWithPrincipal extends Request {
  user?: AuthenticatedPrincipal;
}

export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedPrincipal | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request.user;
    if (!principal) {
      throw new UnauthenticatedException();
    }
    return field ? principal[field] : principal;
  },
);
