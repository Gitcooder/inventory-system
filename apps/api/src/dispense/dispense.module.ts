import { Module } from '@nestjs/common';
import { DispenseController } from './dispense.controller';
import { DispenseService } from './dispense.service';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [AlertsModule],
  controllers: [DispenseController],
  providers: [DispenseService],
  exports: [DispenseService],
})
export class DispenseModule {}
