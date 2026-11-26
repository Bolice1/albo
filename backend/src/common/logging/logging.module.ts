import { DynamicModule, Module } from '@nestjs/common';
import { LoggerModule, Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Options as PinoHttpOptions } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppConfigService } from '@config/app-config.service';
import { resolveSafeRequestId, REQUEST_ID_HEADER } from '../middleware/request-id.middleware';
import { PINO_REDACT_PATHS, REDACTED_PLACEHOLDER } from './redaction.util';

interface ExpressLikeRequest extends IncomingMessage {
  requestId?: string;
  baseUrl?: string;
  originalUrl?: string;
  route?: {
    path?: string;
  };
}

/**
 * Extracts only the route pattern or path without query string parameters,
 * preventing sensitive query strings from ever entering structured logs (CODING_STANDARDS.md §8.2).
 */
export function extractSafeRoutePattern(req: ExpressLikeRequest): string {
  if (req.route?.path && typeof req.route.path === 'string') {
    const base = typeof req.baseUrl === 'string' ? req.baseUrl : '';
    return `${base}${req.route.path}` || '/';
  }
  const rawUrl = req.originalUrl ?? req.url ?? '/';
  const queryIdx = rawUrl.indexOf('?');
  return queryIdx >= 0 ? rawUrl.slice(0, queryIdx) : rawUrl;
}

export function buildPinoHttpOptions(environment: string, level = 'info'): PinoHttpOptions {
  return {
    level,
    genReqId: (req: IncomingMessage) => {
      const expressReq = req as ExpressLikeRequest;
      if (expressReq.requestId) {
        return expressReq.requestId;
      }
      return resolveSafeRequestId(req.headers[REQUEST_ID_HEADER]);
    },
    redact: {
      paths: PINO_REDACT_PATHS,
      censor: REDACTED_PLACEHOLDER,
    },
    customProps: (req: IncomingMessage) => {
      const expressReq = req as ExpressLikeRequest;
      const requestId =
        typeof expressReq.id === 'string'
          ? expressReq.id
          : (expressReq.requestId ?? resolveSafeRequestId(req.headers[REQUEST_ID_HEADER]));
      return {
        service: 'albo-core-api',
        environment,
        request_id: requestId,
        http_method: req.method,
        route_pattern: extractSafeRoutePattern(expressReq),
      };
    },
    customSuccessMessage: () => 'http_request_completed',
    customErrorMessage: () => 'http_request_failed',
    customAttributeKeys: {
      responseTime: 'duration_ms',
    },
    serializers: {
      req: (req: ExpressLikeRequest) => ({
        id: req.id,
        method: req.method,
        route_pattern: extractSafeRoutePattern(req),
      }),
      res: (res: ServerResponse & { statusCode?: number }) => ({
        status_code: res.statusCode,
      }),
      err: (err: Error & { code?: unknown }) => ({
        type: err?.name ?? 'Error',
        error_code: typeof err?.code === 'string' ? err.code : 'INTERNAL_ERROR',
      }),
    },
  };
}

@Module({})
export class LoggingModule {
  static register(destinationStream?: DestinationStream): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [AppConfigService],
          useFactory: (config: AppConfigService): Params => {
            const level = config.isTest ? 'info' : 'info';
            const options = buildPinoHttpOptions(config.nodeEnv, level);
            return {
              pinoHttp: destinationStream ? [options, destinationStream] : options,
            };
          },
        }),
      ],
      exports: [LoggerModule],
    };
  }
}
