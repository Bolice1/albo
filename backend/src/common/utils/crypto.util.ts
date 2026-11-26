import { createHash, timingSafeEqual } from 'node:crypto';

export function canonicalizeJson(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const serialized = entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeJson(v)}`);
    return `{${serialized.join(',')}}`;
  }
  return JSON.stringify(String(value));
}

export function sha256Json(value: unknown): string {
  return createHash('sha256').update(canonicalizeJson(value)).digest('hex');
}

export function sha256Hex(raw: string | Buffer): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function constantTimeEquals(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = createHash('sha256').update(right, 'utf8').digest();
  const digestsMatch = timingSafeEqual(leftDigest, rightDigest);
  const lengthsMatch = Buffer.byteLength(left, 'utf8') === Buffer.byteLength(right, 'utf8');
  return digestsMatch && lengthsMatch;
}
