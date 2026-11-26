/**
 * Centralized redaction and metadata sanitization utilities.
 * Enforces AGENTS.md Rule 12, DP-008, FR-039, and CODING_STANDARDS.md §8.2:
 * Never log or audit credentials, bearer tokens, raw health inputs, check-in responses,
 * precise coordinates, PII, or AI prompts/completions.
 */

export const REDACTED_PLACEHOLDER = '[REDACTED]';

const SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /password/i,
  /passphrase/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /api[-_]?key/i,
  /private[-_]?key/i,
  /credential/i,
  /^numeric_?value$/i,
  /^text_?value$/i,
  /^value$/i,
  /^responses$/i,
  /^input_?payload$/i,
  /^user_?message$/i,
  /^message_?text$/i,
  /^prompt$/i,
  /^completion$/i,
  /^bounded_?summary_?text$/i,
  /^structured_?notes$/i,
  /^notes_?summary$/i,
  /^latitude$/i,
  /^longitude$/i,
  /^lat$/i,
  /^lng$/i,
  /^lon$/i,
  /^coordinates$/i,
  /^display_?name$/i,
  /^full_?name$/i,
  /^first_?name$/i,
  /^last_?name$/i,
  /^email$/i,
  /^contact_?email$/i,
  /^phone$/i,
  /^contact_?phone$/i,
  /^national_?id$/i,
  /^birth_?year$/i,
  /^date_?of_?birth$/i,
  /^dob$/i,
  /^address$/i,
  /^symptom/i,
];

const BEARER_OR_JWT_VALUE_PATTERN =
  /^(Bearer\s+[A-Za-z0-9._~+/-]+=*|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

const MAX_STRING_LENGTH = 256;
const MAX_ARRAY_ITEMS = 25;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeValue(value: unknown, depth: number, maxDepth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return Number.isFinite(value) || typeof value === 'boolean' ? value : String(value);
  }

  if (typeof value === 'string') {
    if (BEARER_OR_JWT_VALUE_PATTERN.test(value.trim())) {
      return REDACTED_PLACEHOLDER;
    }
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`
      : value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= maxDepth) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1, maxDepth));
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nestedVal] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        output[key] = REDACTED_PLACEHOLDER;
      } else {
        output[key] = sanitizeValue(nestedVal, depth + 1, maxDepth);
      }
    }
    return output;
  }

  return String(value);
}

/**
 * Sanitizes a metadata object for structured logs or `audit_events.metadata`.
 * Redacts sensitive keys, strips bearer/JWT strings, and bounds object depth and array size.
 */
export function sanitizeMetadata(input: unknown, maxDepth = 3): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return sanitizeValue(input, 0, maxDepth) as Record<string, unknown>;
}

export const PINO_REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-internal-service-token"]',
  'req.headers["x-api-key"]',
  'req.body',
  'req.query',
  'res.headers["set-cookie"]',
  '*.password',
  '*.secret',
  '*.token',
  '*.authorization',
  '*.cookie',
  '*.numeric_value',
  '*.text_value',
  '*.value',
  '*.responses',
  '*.input_payload',
  '*.user_message',
  '*.message_text',
  '*.prompt',
  '*.latitude',
  '*.longitude',
];
