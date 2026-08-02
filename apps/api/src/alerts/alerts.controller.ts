import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { QueryAlertsDto } from './dto/query-alerts.dto';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ALERTS_REQUIRED_PERMISSION } from './alerts.constants';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @RequirePermissions(ALERTS_REQUIRED_PERMISSION)
  @Get()
  list(@Query() query: QueryAlertsDto) {
    return this.alerts.list(query);
  }

  // Acknowledging reuses the read permission rather than introducing a new
  // 'alert:acknowledge' code — whoever can see stock levels closely enough to
  // care about a shortage (Admin or Employee, per the Phase 1 seed) is
  // trusted to mark it handled.
  @RequirePermissions(ALERTS_REQUIRED_PERMISSION)
  @Patch(':id/acknowledge')
  acknowledge(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.alerts.acknowledge(id, user.id);
  }
}
