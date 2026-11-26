import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorDetail {
  field: string;
  reason: string;
}

export class AppException extends HttpException {
  public readonly errorCode: string;
  public readonly safeMessage: string;
  public readonly details: ErrorDetail[];

  constructor(
    statusCode: number,
    errorCode: string,
    safeMessage: string,
    details: ErrorDetail[] = [],
  ) {
    super(
      {
        code: errorCode,
        message: safeMessage,
        details,
      },
      statusCode,
    );
    this.name = new.target.name;
    this.errorCode = errorCode;
    this.safeMessage = safeMessage;
    this.details = details;
  }
}

export class MalformedRequestException extends AppException {
  constructor(message = 'The request is malformed.', details: ErrorDetail[] = []) {
    super(HttpStatus.BAD_REQUEST, 'MALFORMED_REQUEST', message, details);
  }
}

export class UnauthenticatedException extends AppException {
  constructor(
    message = 'Authentication is required to access this resource.',
    details: ErrorDetail[] = [],
  ) {
    super(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', message, details);
  }
}

export class ForbiddenOperationException extends AppException {
  constructor(
    message = 'You do not have permission to perform this action.',
    details: ErrorDetail[] = [],
  ) {
    super(HttpStatus.FORBIDDEN, 'FORBIDDEN', message, details);
  }
}

export class ConsentRequiredException extends AppException {
  constructor(purposeCode?: string, message = 'Active consent is required for this operation.') {
    const details: ErrorDetail[] = purposeCode
      ? [
          {
            field: 'consent_purpose',
            reason: `missing_active_consent:${purposeCode}`,
          },
        ]
      : [];
    super(HttpStatus.FORBIDDEN, 'CONSENT_REQUIRED', message, details);
  }
}

export class ResourceNotFoundException extends AppException {
  constructor(message = 'The requested resource was not found.', details: ErrorDetail[] = []) {
    super(HttpStatus.NOT_FOUND, 'NOT_FOUND', message, details);
  }
}

export class ConflictDomainException extends AppException {
  constructor(
    message = 'The request conflicts with the current state of the resource.',
    details: ErrorDetail[] = [],
  ) {
    super(HttpStatus.CONFLICT, 'CONFLICT', message, details);
  }
}

export class ValidationDomainException extends AppException {
  constructor(message = 'The request contains invalid fields.', details: ErrorDetail[] = []) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', message, details);
  }
}

export class RateLimitExceededException extends AppException {
  constructor(
    message = 'Too many requests. Please wait before retrying.',
    details: ErrorDetail[] = [],
  ) {
    super(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', message, details);
  }
}

export class FeatureDisabledException extends AppException {
  constructor(
    message = 'This feature is currently disabled by platform governance.',
    details: ErrorDetail[] = [],
  ) {
    super(HttpStatus.SERVICE_UNAVAILABLE, 'FEATURE_DISABLED', message, details);
  }
}

export class DependencyUnavailableException extends AppException {
  constructor(
    message = 'A required downstream service is temporarily unavailable.',
    details: ErrorDetail[] = [],
  ) {
    super(HttpStatus.SERVICE_UNAVAILABLE, 'DEPENDENCY_UNAVAILABLE', message, details);
  }
}
