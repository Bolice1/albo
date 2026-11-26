import { ValidationError, ValidationPipe } from '@nestjs/common';
import { ErrorDetail, ValidationDomainException } from './app.exception';

const CONSTRAINT_REASON_MAP: Readonly<Record<string, string>> = {
  whitelistValidation: 'unknown_field',
  isDefined: 'required',
  isNotEmpty: 'must_not_be_empty',
  isString: 'invalid_string',
  isNumber: 'invalid_number',
  isInt: 'invalid_integer',
  isBoolean: 'invalid_boolean',
  isEnum: 'invalid_enum_value',
  isUuid: 'invalid_uuid',
  isDateString: 'invalid_date',
  isISO8601: 'invalid_iso8601_timestamp',
  isArray: 'invalid_array',
  arrayMaxSize: 'array_too_large',
  arrayMinSize: 'array_too_small',
  min: 'below_minimum',
  max: 'above_maximum',
  minLength: 'too_short',
  maxLength: 'too_long',
  matches: 'invalid_format',
  nestedValidation: 'invalid_nested_object',
};

function toSnakeReason(constraintKey: string): string {
  const mapped = CONSTRAINT_REASON_MAP[constraintKey];
  if (mapped) {
    return mapped;
  }
  return constraintKey
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .toLowerCase();
}

/**
 * Recursively extracts `{ field, reason }` pairs from `class-validator` errors
 * while strictly discarding `value` and `target` so sensitive inputs can never
 * leak into error responses or logs (T-017, CODING_STANDARDS.md §4.4).
 */
export function extractRedactedValidationDetails(
  errors: readonly ValidationError[],
  parentPath = '',
): ErrorDetail[] {
  const details: ErrorDetail[] = [];

  for (const err of errors) {
    const fieldPath = parentPath ? `${parentPath}.${err.property}` : err.property;

    if (err.constraints) {
      for (const constraintKey of Object.keys(err.constraints)) {
        details.push({
          field: fieldPath,
          reason: toSnakeReason(constraintKey),
        });
      }
    }

    if (err.children && err.children.length > 0) {
      details.push(...extractRedactedValidationDetails(err.children, fieldPath));
    }
  }

  return details;
}

export function createRedactedValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: false,
    },
    validationError: {
      target: false,
      value: false,
    },
    exceptionFactory: (errors: ValidationError[]) => {
      const details = extractRedactedValidationDetails(errors);
      return new ValidationDomainException('The request contains invalid fields.', details);
    },
  });
}
