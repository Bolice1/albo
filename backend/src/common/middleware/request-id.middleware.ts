import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from '../context/request-context.service';

export const REQUEST_ID_HEADER = 'x-request-id';
export const REQUEST_ID_RESPONSE_HEADER = 'X-Request-Id';
export const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export interface RequestWithContext extends Request {
  requestId?: string;
}

export function resolveSafeRequestId(candidate: unknown): string {
  if (typeof candidate === 'string' && SAFE_REQUEST_ID_PATTERN.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: RequestWithContext, res: Response, next: NextFunction): void {
    const headerValue = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof headerValue === 'string' && SAFE_REQUEST_ID_PATTERN.test(headerValue)
        ? headerValue
        : typeof req.id === 'string' && SAFE_REQUEST_ID_PATTERN.test(req.id)
          ? req.id
          : randomUUID();

    req.id = requestId;
    req.requestId = requestId;
    req.headers[REQUEST_ID_HEADER] = requestId;
    res.setHeader(REQUEST_ID_RESPONSE_HEADER, requestId);

    this.requestContext.run({ requestId }, () => {
      next();
    });
  }
}
