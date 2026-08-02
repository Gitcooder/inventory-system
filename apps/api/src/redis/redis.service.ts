import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  /** General-purpose connection — GET/SET/DEL, and PUBLISH (which, unlike
   *  SUBSCRIBE, is a perfectly normal command). */
  public client: Redis;
  /** Dedicated connection for SUBSCRIBE. Redis (and ioredis) puts a
   *  connection that has subscribed into a restricted "subscriber mode" —
   *  it can no longer run ordinary commands until it unsubscribes — so this
   *  can never share a connection with `client` above. */
  public subscriber: Redis;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL')!;
    this.client = new Redis(url, { lazyConnect: true });
    this.subscriber = new Redis(url, { lazyConnect: true });
  }

  async onModuleInit() {
    this.client.on('error', (err) =>
      this.logger.error(`Redis client error: ${err.message}`),
    );
    this.subscriber.on('error', (err) =>
      this.logger.error(`Redis subscriber error: ${err.message}`),
    );
    await Promise.all([this.client.connect(), this.subscriber.connect()]);
  }

  async onModuleDestroy() {
    await Promise.all([this.client.quit(), this.subscriber.quit()]);
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }
}
