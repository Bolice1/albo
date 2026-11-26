import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { from, Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { PrismaService } from '@database/prisma.service';
import { RequestContextService } from '../context/request-context.service';
import { AuthenticatedPrincipal } from '../decorators/authenticated-principal.interface';
import { ConflictDomainException, MalformedRequestException } from '../errors/app.exception';
import {
  REQUEST_ID_HEADER,
  RequestWithContext,
  resolveSafeRequestId,
} from '../middleware/request-id.middleware';
import { sha256Json } from '../utils/crypto.util';

export const IDEMPOTENT_ROUTE_KEY = 'idempotentRouteKey';
export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const SAFE_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export const Idempotent = (routeKey: string) => SetMetadata(IDEMPOTENT_ROUTE_KEY, routeKey);

interface RequestWithPrincipal extends RequestWithContext, Request {
  user?: AuthenticatedPrincipal;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const routeKey = this.reflector.getAllAndOverride<string | undefined>(IDEMPOTENT_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!routeKey) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithPrincipal>();
    const response = http.getResponse<Response>();

    const rawHeader = request.headers[IDEMPOTENCY_HEADER];
    if (rawHeader === undefined) {
      return next.handle();
    }

    if (typeof rawHeader !== 'string' || !SAFE_IDEMPOTENCY_KEY_PATTERN.test(rawHeader)) {
      throw new MalformedRequestException(
        'Idempotency-Key must be an opaque token of 1 to 128 safe characters.',
        [{ field: 'Idempotency-Key', reason: 'invalid_idempotency_key' }],
      );
    }

    const principal = request.user;
    if (!principal?.userAccountId) {
      return next.handle();
    }

    const requestSha256 = sha256Json(request.body ?? {});
    const requestId =
      RequestContextService.getCurrentRequestId() ??
      request.requestId ??
      resolveSafeRequestId(request.headers[REQUEST_ID_HEADER]);

    return from(
      this.lookupExistingRecord(principal.userAccountId, routeKey, rawHeader, requestSha256),
    ).pipe(
      mergeMap((cached) => {
        if (cached) {
          response.status(cached.statusCode);
          return of(this.refreshEnvelopeRequestId(cached.responseBody, requestId));
        }

        return next.handle().pipe(
          mergeMap((responseBody: unknown) =>
            from(
              this.persistIdempotencyRecord(
                principal.userAccountId,
                routeKey,
                rawHeader,
                requestSha256,
                response.statusCode || 200,
                responseBody,
              ),
            ).pipe(
              mergeMap((persisted) => {
                response.status(persisted.statusCode);
                return of(this.refreshEnvelopeRequestId(persisted.responseBody, requestId));
              }),
            ),
          ),
        );
      }),
    );
  }

  private async lookupExistingRecord(
    userAccountId: string,
    routeKey: string,
    idempotencyKey: string,
    requestSha256: string,
  ): Promise<{ statusCode: number; responseBody: unknown } | null> {
    const now = new Date();
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: {
        userAccountId_routeKey_idempotencyKey: {
          userAccountId,
          routeKey,
          idempotencyKey,
        },
      },
    });

    if (!existing) {
      return null;
    }

    if (existing.expiresAt <= now) {
      await this.prisma.idempotencyRecord.delete({
        where: { id: existing.id },
      });
      return null;
    }

    if (existing.requestSha256 !== requestSha256) {
      throw new ConflictDomainException(
        'Idempotency-Key cannot be reused with a different request payload.',
        [{ field: 'Idempotency-Key', reason: 'idempotency_payload_mismatch' }],
      );
    }

    return {
      statusCode: existing.statusCode,
      responseBody: existing.responseBody,
    };
  }

  private async persistIdempotencyRecord(
    userAccountId: string,
    routeKey: string,
    idempotencyKey: string,
    requestSha256: string,
    statusCode: number,
    responseBody: unknown,
  ): Promise<{ statusCode: number; responseBody: unknown }> {
    const expiresAt = new Date(Date.now() + DEFAULT_IDEMPOTENCY_TTL_MS);
    const jsonBody = JSON.parse(JSON.stringify(responseBody ?? null)) as Prisma.InputJsonValue;

    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          userAccountId,
          routeKey,
          idempotencyKey,
          requestSha256,
          statusCode,
          responseBody: jsonBody,
          expiresAt,
        },
      });
      return { statusCode, responseBody };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.lookupExistingRecord(
          userAccountId,
          routeKey,
          idempotencyKey,
          requestSha256,
        );
        if (raced) {
          return raced;
        }
      }
      throw err;
    }
  }

  private refreshEnvelopeRequestId(body: unknown, requestId: string): unknown {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return body;
    }
    const obj = body as Record<string, unknown>;
    if ('data' in obj && obj.meta && typeof obj.meta === 'object' && !Array.isArray(obj.meta)) {
      return {
        ...obj,
        meta: {
          ...(obj.meta as Record<string, unknown>),
          request_id: requestId,
        },
      };
    }
    return body;
  }
}
