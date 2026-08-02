import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Liveness — "is the process up". Useful for Docker/k8s restart decisions.
  @Public()
  @Get('health')
  health() {
    return this.appService.getHealth();
  }

  // Readiness — "can this instance serve real traffic right now". Returns
  // 503 (not 200-with-a-status-field) when not ready, since that's what
  // load balancers and orchestrators actually key off of.
  @Public()
  @Get('health/ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const result = await this.appService.getReadiness();
    res.status(result.status === 'ok' ? 200 : 503);
    return result;
  }
}
