import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

const DEFAULT_PAGE_SIZE = 20;

export interface RecordAuditEntryInput {
  userId: number | null;
  action: string;
  entityType: string;
  entityId?: number;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deliberately never throws — same resilience posture as
   * AlertsService.maybeTriggerLowStockAlert. Recording *that* an action
   * happened must never be the reason the action itself fails; worst case,
   * one audit entry is missing and the error is logged for someone to
   * notice, rather than an Admin being unable to create a user because the
   * audit table had a hiccup.
   */
  async record(entry: RecordAuditEntryInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          oldValue:
            entry.oldValue === undefined
              ? undefined
              : (entry.oldValue as object),
          newValue:
            entry.newValue === undefined
              ? undefined
              : (entry.newValue as object),
          ipAddress: entry.ipAddress,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to record audit entry '${entry.action}': ${(err as Error).message}`,
      );
    }
  }

  async list(query: QueryAuditLogDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }
}
