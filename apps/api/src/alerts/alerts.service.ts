import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { QueryAlertsDto } from './dto/query-alerts.dto';
import { LOW_STOCK_CHANNEL } from './alerts.constants';

const DEFAULT_PAGE_SIZE = 20;

interface StockSnapshot {
  productId: number;
  locationId: number;
  quantity: number;
  thresholdLimit: number;
  product: { name: string };
  location: { name: string };
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Called after a stock-changing operation (dispense or adjustment) commits.
   * Fires only on the *crossing* — quantityBefore was above the threshold and
   * the new quantity isn't — not on every action while already low. The
   * architecture doc's literal lifecycle (§6.2) re-evaluates on every change,
   * which would mean a new WebSocket push and a new AlertLog row for every
   * single dispense while a product sits below threshold; crossing-only is a
   * deliberate improvement to avoid that alert-fatigue spam, still fully
   * satisfying "notify when stock needs reordering."
   *
   * Deliberately never throws: alerting is a secondary, best-effort feature
   * layered on top of the core stock ledger (per the doc's own framing in
   * §6 — "an active, intelligent management tool" on top of the passive
   * ledger, not part of it). A Redis hiccup here must never block a dispense
   * or a restock from completing.
   */
  async maybeTriggerLowStockAlert(
    stock: StockSnapshot,
    quantityBefore: number,
  ): Promise<void> {
    const wasAboveThreshold = quantityBefore > stock.thresholdLimit;
    const isNowAtOrBelow = stock.quantity <= stock.thresholdLimit;
    if (!(wasAboveThreshold && isNowAtOrBelow)) return;

    try {
      const alert = await this.prisma.alertLog.create({
        data: {
          productId: stock.productId,
          locationId: stock.locationId,
          stockAtTrigger: stock.quantity,
          thresholdAtTrigger: stock.thresholdLimit,
        },
      });

      const payload = {
        alertId: alert.id,
        productId: stock.productId,
        productName: stock.product.name,
        locationId: stock.locationId,
        locationName: stock.location.name,
        quantity: stock.quantity,
        thresholdLimit: stock.thresholdLimit,
        triggeredAt: alert.triggeredAt,
      };

      await this.redis.publish(LOW_STOCK_CHANNEL, JSON.stringify(payload));
    } catch (err) {
      this.logger.error(
        `Failed to publish low-stock alert: ${(err as Error).message}`,
      );
    }
  }

  async list(query: QueryAlertsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.acknowledged === undefined
        ? {}
        : query.acknowledged
          ? { acknowledgedAt: { not: null } }
          : { acknowledgedAt: null }),
    };

    const [data, total] = await Promise.all([
      this.prisma.alertLog.findMany({
        where,
        include: {
          product: true,
          location: true,
          acknowledgedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { triggeredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.alertLog.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async acknowledge(id: number, userId: number) {
    const alert = await this.prisma.alertLog.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found.');

    return this.prisma.alertLog.update({
      where: { id },
      data: { acknowledgedByUserId: userId, acknowledgedAt: new Date() },
      include: {
        product: true,
        location: true,
        acknowledgedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }
}
