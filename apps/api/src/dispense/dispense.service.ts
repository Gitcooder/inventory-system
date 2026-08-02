import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDispenseDto } from './dto/create-dispense.dto';
import { QueryDispenseDto } from './dto/query-dispense.dto';
import { toHttpException } from '../common/prisma-error.util';
import { AlertsService } from '../alerts/alerts.service';

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_BATCH = 'default';

@Injectable()
export class DispenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
  ) {}

  /**
   * The highest-contention path in the whole system: two employees dispensing
   * the last unit at the same instant must never both succeed. Unlike
   * InventoryService.adjust() (Phase 3's atomic conditional UPDATE), this
   * uses explicit pessimistic locking via `SELECT ... FOR UPDATE` — the
   * mechanism docs/architecture.md §4.2 specifically calls out for this case:
   * the row lock is held for the whole transaction, so a second concurrent
   * dispense against the same stock row blocks until the first commits or
   * rolls back, then sees the *updated* quantity, not the stale one.
   * See dispense.service.spec.ts for the (mocked) test, and
   * test/dispense-concurrency.e2e-spec.ts for the real-DB proof.
   */
  async dispense(dto: CreateDispenseDto, dispensedByUserId: number) {
    await this.assertProductAndLocationExist(dto.productId, dto.locationId);
    const batchNumber = dto.batchNumber ?? DEFAULT_BATCH;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: number; quantity: number }[]>`
          SELECT id, quantity FROM inventory_stocks
          WHERE product_id = ${dto.productId} AND location_id = ${dto.locationId} AND batch_number = ${batchNumber}
          FOR UPDATE
        `;

        if (rows.length === 0) {
          throw new BadRequestException(
            'No stock record exists for this product at this location — restock it first.',
          );
        }
        const stockRow = rows[0];
        if (stockRow.quantity < dto.quantityUsed) {
          throw new BadRequestException(
            `Insufficient stock: ${stockRow.quantity} available, ${dto.quantityUsed} requested.`,
          );
        }

        await tx.inventoryStock.update({
          where: { id: stockRow.id },
          data: { quantity: { decrement: dto.quantityUsed } },
        });

        const usageLog = await tx.usageLog.create({
          data: {
            productId: dto.productId,
            userId: dispensedByUserId,
            locationId: dto.locationId,
            quantityUsed: dto.quantityUsed,
            purposeDescription: dto.purposeDescription,
          },
          include: {
            product: true,
            location: true,
            user: { select: { id: true, name: true, email: true } },
          },
        });

        const stock = await tx.inventoryStock.findUniqueOrThrow({
          where: { id: stockRow.id },
          include: { product: true, location: true },
        });

        return { stock, usageLog, quantityBefore: stockRow.quantity };
      });

      // Best-effort, outside the transaction — see
      // AlertsService.maybeTriggerLowStockAlert's comment on why a Redis
      // hiccup here must never fail the dispense that already succeeded.
      await this.alerts.maybeTriggerLowStockAlert(
        result.stock,
        result.quantityBefore,
      );

      return { stock: result.stock, usageLog: result.usageLog };
    } catch (err) {
      throw toHttpException(err, 'Dispense');
    }
  }

  async list(query: QueryDispenseDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.usageLog.findMany({
        where,
        include: {
          product: true,
          location: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.usageLog.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: number) {
    const log = await this.prisma.usageLog.findUnique({
      where: { id },
      include: {
        product: true,
        location: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!log) throw new NotFoundException('Usage log not found.');
    return log;
  }

  private async assertProductAndLocationExist(
    productId: number,
    locationId: number,
  ) {
    const [product, location] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: productId } }),
      this.prisma.location.findUnique({ where: { id: locationId } }),
    ]);
    if (!product) throw new NotFoundException('Product not found.');
    if (!location) throw new NotFoundException('Location not found.');
  }
}
