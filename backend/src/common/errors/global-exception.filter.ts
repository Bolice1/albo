import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import type { Response } from 'express';
import { RequestContextService } from '../context/request-context.service';
import {
  REQUEST_ID_HEADER,
  REQUEST_ID_RESPONSE_HEADER,
  RequestWithContext,
  resolveSafeRequestId,
} from '../middleware/request-id.middleware';
import { AppException, ErrorDetail } from './app.exception';

interface MappedError {
  statusCode: number;
  code: string;
  message: string;
  details: ErrorDetail[];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@Optional() private readonly logger?: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithContext>();
    const response = ctx.getResponse<Response>();

    const requestId =
      RequestContextService.getCurrentRequestId() ??
      request.requestId ??
      resolveSafeRequestId(request.headers?.[REQUEST_ID_HEADER]);

    if (!response.getHeader(REQUEST_ID_RESPONSE_HEADER)) {
      response.setHeader(REQUEST_ID_RESPONSE_HEADER, requestId);
    }

    const mapped = this.mapException(exception);
    const exceptionClass =
      exception && typeof exception === 'object' && 'constructor' in exception
        ? ((exception as { constructor: { name?: string } }).constructor.name ?? 'Error')
        : 'UnknownError';

    // Log ONLY sanitized metadata — never stack traces, SQL errors, or raw input values
    if (this.logger) {
      const logPayload = {
        request_id: requestId,
        status_code: mapped.statusCode,
        error_code: mapped.code,
        exception_type: exceptionClass,
      };
      if (mapped.statusCode >= 500) {
        this.logger.error(logPayload, 'request_exception_handled');
      } else {
        this.logger.warn(logPayload, 'request_exception_handled');
      }
    }

    response.status(mapped.statusCode).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        details: mapped.details,
        request_id: requestId,
      },
    });
  }

  private mapException(exception: unknown): MappedError {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.errorCode,
        message: exception.safeMessage,
        details: exception.details.map((d) => ({
          field: String(d.field),
          reason: String(d.reason),
        })),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'A conflicting record already exists.',
          details: [],
        };
      }
      if (exception.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          details: [],
        };
      }
      if (exception.code === 'P2003') {
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'The operation conflicts with related resource constraints.',
          details: [],
        };
      }
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred.',
        details: [],
      };
    }

    if (
      exception instanceof Prisma.PrismaClientUnknownRequestError ||
      exception instanceof Prisma.PrismaClientValidationError ||
      exception instanceof Prisma.PrismaClientInitializationError ||
      exception instanceof Prisma.PrismaClientRustPanicError
    ) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred.',
        details: [],
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return this.mapStandardHttpStatus(status);
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred.',
      details: [],
    };
  }

  private mapStandardHttpStatus(status: number): MappedError {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          code: 'MALFORMED_REQUEST',
          message: 'The request is malformed.',
          details: [],
        };
      case HttpStatus.UNAUTHORIZED:
        return {
          statusCode: HttpStatus.UNAUTHORIZED,
          code: 'UNAUTHENTICATED',
          message: 'Authentication is required to access this resource.',
          details: [],
        };
      case HttpStatus.FORBIDDEN:
        return {
          statusCode: HttpStatus.FORBIDDEN,
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action.',
          details: [],
        };
      case HttpStatus.NOT_FOUND:
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          details: [],
        };
      case HttpStatus.METHOD_NOT_ALLOWED:
        return {
          statusCode: HttpStatus.METHOD_NOT_ALLOWED,
          code: 'MALFORMED_REQUEST',
          message: 'HTTP method not allowed for this resource.',
          details: [],
        };
      case HttpStatus.CONFLICT:
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'The request conflicts with the current state of the resource.',
          details: [],
        };
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return {
          statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
          code: 'MALFORMED_REQUEST',
          message: 'The request payload exceeds the maximum permitted size.',
          details: [],
        };
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          code: 'VALIDATION_ERROR',
          message: 'The request contains invalid fields.',
          details: [],
        };
      case HttpStatus.TOO_MANY_REQUESTS:
        return {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please wait before retrying.',
          details: [],
        };
      case HttpStatus.BAD_GATEWAY:
      case HttpStatus.SERVICE_UNAVAILABLE:
      case HttpStatus.GATEWAY_TIMEOUT:
        return {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'A required downstream service is temporarily unavailable.',
          details: [],
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'INTERNAL_ERROR',
          message: 'An unexpected internal error occurred.',
          details: [],
        };
    }
  }
}
