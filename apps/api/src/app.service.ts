import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: "is the process up at all" — deliberately checks nothing
   *  external. A slow/unreachable DB should never cause an orchestrator to
   *  kill and restart an otherwise-healthy process in a crash loop; that's
   *  exactly the failure mode liveness vs. readiness separation exists to
   *  avoid. */
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /** Readiness: "is this instance actually able to serve real traffic" —
   *  checks the two things every request effectively depends on. Used by a
   *  load balancer/orchestrator to decide whether to route traffic here, not
   *  whether to restart the process. */
  async getReadiness() {
    const [databaseOk, redisOk] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    const ready = databaseOk && redisOk;

    return {
      status: ready ? 'ok' : 'unavailable',
      checks: {
        database: databaseOk ? 'ok' : 'unavailable',
        redis: redisOk ? 'ok' : 'unavailable',
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      await this.redis.client.ping();
      return true;
    } catch {
      return false;
    }
  }
}
