import { Controller, Get } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RequirePermissions } from '../rbac/permissions.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  // Gated by 'user:manage' rather than a separate 'role:manage' read scope —
  // the only current consumer is the admin user-creation form, which already
  // requires 'user:manage'. Revisit if roles ever need to be visible outside that flow.
  @RequirePermissions('user:manage')
  @Get()
  list() {
    return this.roles.list();
  }
}
