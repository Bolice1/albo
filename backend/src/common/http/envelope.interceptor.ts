import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RequestContextService } from '../context/request-context.service';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator';
import {
  REQUEST_ID_HEADER,
  RequestWithContext,
  resolveSafeRequestId,
} from '../middleware/request-id.middleware';
import { isPaginatedResult, PaginationMeta } from './pagination.util';

export interface ApiSuccessEnvelope<T = unknown> {
  data: T;
  meta: {
    request_id: string;
    pagination?: PaginationMeta;
  };
}

function isAlreadyEnveloped(value: unknown): value is ApiSuccessEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (!('data' in obj) || !('meta' in obj)) {
    return false;
  }
  const meta = obj.meta;
  return (
    Boolean(meta) &&
    typeof meta === 'object' &&
    !Array.isArray(meta) &&
    typeof (meta as Record<string, unknown>).request_id === 'string'
  );
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skipEnvelope = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipEnvelope) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const requestId =
      RequestContextService.getCurrentRequestId() ??
      request.requestId ??
      resolveSafeRequestId(request.headers?.[REQUEST_ID_HEADER]);

    return next.handle().pipe(
      map((payload: unknown): ApiSuccessEnvelope => {
        if (isAlreadyEnveloped(payload)) {
          return {
            data: payload.data,
            meta: {
              ...payload.meta,
              request_id: requestId,
            },
          };
        }

        if (isPaginatedResult(payload)) {
          return {
            data: payload.items,
            meta: {
              request_id: requestId,
              pagination: payload.pagination,
            },
          };
        }

        return {
          data: payload ?? null,
          meta: {
            request_id: requestId,
          },
        };
      }),
    );
  }
}
