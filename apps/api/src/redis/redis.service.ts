import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client: Redis;
  public subscriber: Redis;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL')!;
    // No lazyConnect: ioredis connects immediately on construction and
    // automatically queues any commands issued before the connection is
    // ready, running them once it is. This avoids the manual connect()
    // race that was causing "Redis is already connecting/connected".
    this.client = new Redis(url);
    this.subscriber = new Redis(url);

    this.client.on('error', (err) =>
      this.logger.error(`Redis client error: ${err.message}`),
    );
    this.subscriber.on('error', (err) =>
      this.logger.error(`Redis subscriber error: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await Promise.all([this.client.quit(), this.subscriber.quit()]);
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }
}
