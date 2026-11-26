import { Injectable } from '@nestjs/common';
import { ActorType, AuditEvent, AuditOutcome, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from '@common/context/request-context.service';
import {
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  PaginatedResult,
  paginateItems,
} from '@common/http/pagination.util';
import { sanitizeMetadata } from '@common/logging/redaction.util';
import { PrismaService } from '@database/prisma.service';

export interface RecordAuditEventInput {
  actorId?: string | null;
  actorType: ActorType;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  requestId?: string;
  organizationId?: string | null;
  purposeCode?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditEventsFilter {
  actorId?: string;
  resourceType?: string;
  action?: string;
  outcome?: AuditOutcome;
  limit?: number;
  cursor?: string;
}

export interface AuditEventView {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_type: ActorType;
  action: string;
  resource_type: string;
  resource_id: string | null;
  outcome: AuditOutcome;
  request_id: string;
  organization_id: string | null;
  purpose_code: string | null;
  metadata: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async record(event: RecordAuditEventInput, tx?: Prisma.TransactionClient): Promise<AuditEvent> {
    const client = tx ?? this.prisma;
    const requestId = event.requestId ?? this.requestContext.getRequestId() ?? randomUUID();
    const cleanMetadata = sanitizeMetadata(event.metadata ?? {}) as Prisma.InputJsonValue;

    return client.auditEvent.create({
      data: {
        actorId: event.actorId ?? null,
        actorType: event.actorType,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId ?? null,
        outcome: event.outcome,
        requestId,
        organizationId: event.organizationId ?? null,
        purposeCode: event.purposeCode ?? null,
        metadata: cleanMetadata,
      },
    });
  }

  async listEvents(filter: AuditEventsFilter): Promise<PaginatedResult<AuditEventView>> {
    const limit = filter.limit ?? DEFAULT_PAGE_LIMIT;
    const cursorWhere = this.buildCursorFilter(filter.cursor);

    const where: Prisma.AuditEventWhereInput = {
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.resourceType ? { resourceType: filter.resourceType } : {}),
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.outcome ? { outcome: filter.outcome } : {}),
      ...(cursorWhere ? { AND: [cursorWhere] } : {}),
    };

    const rows = await this.prisma.auditEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const mapped = rows.map((row) => this.toView(row));
    return paginateItems(mapped, limit, (item) => ({
      id: item.id,
      sortValue: item.occurred_at,
    }));
  }

  private buildCursorFilter(cursor?: string): Prisma.AuditEventWhereInput | undefined {
    if (!cursor) {
      return undefined;
    }
    const decoded = decodeCursor(cursor);
    const sortDate = new Date(decoded.sortValue);
    if (Number.isNaN(sortDate.getTime())) {
      return undefined;
    }
    return {
      OR: [
        { occurredAt: { lt: sortDate } },
        {
          occurredAt: sortDate,
          id: { lt: decoded.id },
        },
      ],
    };
  }

  private toView(row: AuditEvent): AuditEventView {
    return {
      id: row.id,
      occurred_at: row.occurredAt.toISOString(),
      actor_id: row.actorId,
      actor_type: row.actorType,
      action: row.action,
      resource_type: row.resourceType,
      resource_id: row.resourceId,
      outcome: row.outcome,
      request_id: row.requestId,
      organization_id: row.organizationId,
      purpose_code: row.purposeCode,
      metadata: sanitizeMetadata(row.metadata),
    };
  }
}
