import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RbacService } from '../rbac/rbac.service';
import { RedisService } from '../redis/redis.service';
import {
  ALERTS_REQUIRED_PERMISSION,
  LOW_STOCK_CHANNEL,
} from './alerts.constants';

interface JwtPayload {
  sub: number;
  email: string;
  roles: string[];
}

interface SocketData {
  user: { id: number; email: string; roles: string[] };
}

type AlertsSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

/**
 * Namespace 'alerts' — matches apps/web/src/lib/socket.ts. Every server node
 * in a horizontally-scaled deployment runs its own instance of this gateway;
 * afterInit() subscribes each one to the same Redis channel independently,
 * so a stock change on any node reaches clients connected to every node —
 * the fan-out pattern from docs/architecture.md §6.2.
 */
@WebSocketGateway({
  namespace: 'alerts',
  cors: {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class AlertsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AlertsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly rbac: RbacService,
    private readonly redis: RedisService,
  ) {}

  async afterInit() {
    await this.redis.subscriber.subscribe(LOW_STOCK_CHANNEL);
    this.redis.subscriber.on('message', (channel: string, message: string) => {
      if (channel !== LOW_STOCK_CHANNEL) return;
      this.server.emit('low_stock_alert', JSON.parse(message) as unknown);
    });
    this.logger.log(`Subscribed to Redis channel '${LOW_STOCK_CHANNEL}'`);
  }

  // Socket.io connections don't go through the HTTP Guard pipeline, so the
  // same JWT-verify-then-check-permission logic PermissionsGuard does for
  // REST is done by hand here, once, at handshake time — not per message,
  // since this gateway only ever pushes server->client, it never accepts
  // client messages that would need their own authorization check.
  async handleConnection(client: AlertsSocket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('No token provided');

      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });

      const permissions = await this.rbac.getPermissionsForRoles(payload.roles);
      if (!permissions.has(ALERTS_REQUIRED_PERMISSION)) {
        throw new Error(`Missing '${ALERTS_REQUIRED_PERMISSION}' permission`);
      }

      client.data.user = {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles,
      };
    } catch (err) {
      this.logger.warn(
        `Rejected WebSocket connection: ${(err as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // No per-connection state to release yet — a room-based scheme (e.g.
    // only pushing alerts for locations a user is assigned to) would clean
    // up room membership here.
  }
}
