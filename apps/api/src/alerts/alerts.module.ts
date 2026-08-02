import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertsGateway } from './alerts.gateway';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  // JwtModule.register({}) mirrors AuthModule's own registration — no shared
  // secret baked in here either, it's passed explicitly on every
  // verifyAsync() call (see AlertsGateway.handleConnection). RbacModule is
  // needed for the same permission check PermissionsGuard does for REST.
  imports: [JwtModule.register({}), RbacModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsGateway],
  exports: [AlertsService],
})
export class AlertsModule {}
