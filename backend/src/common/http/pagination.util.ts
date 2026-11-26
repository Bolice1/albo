import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MalformedRequestException } from '../errors/app.exception';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export class CursorPaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number = DEFAULT_PAGE_LIMIT;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}

export interface CursorPayload {
  id: string;
  sortValue: string;
}

export interface PaginationMeta {
  limit: number;
  next_cursor: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

export function isPaginatedResult(value: unknown): value is PaginatedResult<unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.items)) {
    return false;
  }
  const pagination = candidate.pagination;
  if (!pagination || typeof pagination !== 'object') {
    return false;
  }
  const pagObj = pagination as Record<string, unknown>;
  return (
    typeof pagObj.limit === 'number' &&
    (pagObj.next_cursor === null || typeof pagObj.next_cursor === 'string')
  );
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify({
    id: payload.id,
    sortValue: payload.sortValue,
  });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  if (!cursor || typeof cursor !== 'string' || cursor.length > 512) {
    throw new MalformedRequestException('Invalid pagination cursor.');
  }
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new MalformedRequestException('Invalid pagination cursor.');
    }
    const obj = parsed as Record<string, unknown>;
    if (
      typeof obj.id !== 'string' ||
      obj.id.trim().length === 0 ||
      typeof obj.sortValue !== 'string' ||
      obj.sortValue.trim().length === 0
    ) {
      throw new MalformedRequestException('Invalid pagination cursor.');
    }
    return {
      id: obj.id,
      sortValue: obj.sortValue,
    };
  } catch (err) {
    if (err instanceof MalformedRequestException) {
      throw err;
    }
    throw new MalformedRequestException('Invalid pagination cursor.');
  }
}

export function paginateItems<T>(
  rows: readonly T[],
  limit: number,
  getCursorPayload: (item: T) => CursorPayload,
): PaginatedResult<T> {
  const normalizedLimit = Math.min(
    Math.max(1, Math.trunc(limit || DEFAULT_PAGE_LIMIT)),
    MAX_PAGE_LIMIT,
  );
  const hasMore = rows.length > normalizedLimit;
  const items = hasMore ? rows.slice(0, normalizedLimit) : [...rows];
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? encodeCursor(getCursorPayload(lastItem)) : null;

  return {
    items,
    pagination: {
      limit: normalizedLimit,
      next_cursor: nextCursor,
    },
  };
}
