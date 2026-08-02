import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { RequirePermissions } from '../rbac/permissions.decorator';

@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @RequirePermissions('audit:view')
  @Get()
  list(@Query() query: QueryAuditLogDto) {
    return this.auditLog.list(query);
  }
}
