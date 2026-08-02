import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryStockDto } from './dto/create-inventory-stock.dto';
import { UpdateInventoryStockThresholdDto } from './dto/update-inventory-stock-threshold.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { QueryAdjustmentsDto } from './dto/query-adjustments.dto';
import { toHttpException } from '../common/prisma-error.util';
import type { AdjustmentType } from './adjustment-type';
import { AlertsService } from '../alerts/alerts.service';

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_THRESHOLD = 5;
const DEFAULT_BATCH = 'default';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
  ) {}

  async list(query: QueryInventoryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
    };

    // lowStockOnly compares two columns on the same row (quantity vs.
    // thresholdLimit), which Prisma's query builder can't express without
    // raw SQL. Inventory row counts are catalog-scale (products × locations
    // × batches), not usage_logs-scale, so fetch-then-filter-in-JS is the
    // simpler and equally-correct choice here — same tradeoff already made
    // for Category/Location .tree() in Phase 2.
    const all = await this.prisma.inventoryStock.findMany({
      where,
      include: { product: true, location: true },
      orderBy: [{ productId: 'asc' }, { locationId: 'asc' }],
    });

    const filtered = query.lowStockOnly
      ? all.filter((s) => s.quantity <= s.thresholdLimit)
      : all;
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);

    return { data, total, page, pageSize };
  }

  async findOne(id: number) {
    const stock = await this.prisma.inventoryStock.findUnique({
      where: { id },
      include: { product: true, location: true },
    });
    if (!stock) throw new NotFoundException('Stock record not found.');
    return stock;
  }

  /** Explicit creation — for onboarding a product at a location with a
   *  specific starting quantity/threshold/batch/expiration up front, as
   *  opposed to letting the first restock adjustment create it implicitly
   *  (see `adjust()`). Both paths converge on the same table. */
  async create(dto: CreateInventoryStockDto) {
    await this.assertProductAndLocationExist(dto.productId, dto.locationId);
    try {
      return await this.prisma.inventoryStock.create({
        data: {
          productId: dto.productId,
          locationId: dto.locationId,
          batchNumber: dto.batchNumber ?? DEFAULT_BATCH,
          quantity: dto.quantity ?? 0,
          thresholdLimit: dto.thresholdLimit ?? DEFAULT_THRESHOLD,
          expirationDate: dto.expirationDate
            ? new Date(dto.expirationDate)
            : undefined,
        },
        include: { product: true, location: true },
      });
    } catch (err) {
      throw toHttpException(err, 'Stock record');
    }
  }

  async updateThreshold(id: number, dto: UpdateInventoryStockThresholdDto) {
    try {
      return await this.prisma.inventoryStock.update({
        where: { id },
        data: { thresholdLimit: dto.thresholdLimit },
        include: { product: true, location: true },
      });
    } catch (err) {
      throw toHttpException(err, 'Stock record');
    }
  }

  /**
   * The core restock/correction/damage/expired action. Get-or-creates the
   * stock row, applies the quantity change atomically (never negative, no
   * race window — see schema.prisma's comment on InventoryStock), and writes
   * an immutable StockAdjustment record in the same transaction.
   */
  async adjust(dto: CreateStockAdjustmentDto, adjustedByUserId: number) {
    this.assertSignMatchesType(dto.adjustmentType, dto.quantityChange);
    await this.assertProductAndLocationExist(dto.productId, dto.locationId);
    const batchNumber = dto.batchNumber ?? DEFAULT_BATCH;
    let quantityBefore = 0;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Get-or-create atomically: INSERT ... ON CONFLICT DO NOTHING, then
        // look up either way. Closes the race where two concurrent
        // first-time adjustments both try to create the same
        // (product, location, batch) row.
        const inserted = await tx.$queryRaw<{ id: number }[]>`
          INSERT INTO inventory_stocks (product_id, location_id, batch_number, quantity, threshold_limit, updated_at)
          VALUES (${dto.productId}, ${dto.locationId}, ${batchNumber}, 0, ${DEFAULT_THRESHOLD}, now())
          ON CONFLICT (product_id, location_id, batch_number) DO NOTHING
          RETURNING id
        `;

        let stockId: number;
        if (inserted.length > 0) {
          stockId = inserted[0].id;
          quantityBefore = 0; // freshly created — nothing existed before this adjustment
        } else {
          const existing = await tx.inventoryStock.findUnique({
            where: {
              productId_locationId_batchNumber: {
                productId: dto.productId,
                locationId: dto.locationId,
                batchNumber,
              },
            },
          });
          if (!existing) {
            // The ON CONFLICT branch only skips if a row already exists, so
            // this is unreachable outside of a bug in the query above.
            throw new BadRequestException(
              'Could not resolve the stock record for this adjustment.',
            );
          }
          stockId = existing.id;
          quantityBefore = existing.quantity;
        }

        // The atomic guarantee: this single statement checks and applies the
        // change together, so no concurrent adjustment can interleave and
        // push quantity negative.
        const affected: number = await tx.$executeRaw`
          UPDATE inventory_stocks
          SET quantity = quantity + ${dto.quantityChange}, updated_at = now()
          WHERE id = ${stockId} AND quantity + ${dto.quantityChange} >= 0
        `;
        if (affected === 0) {
          throw new BadRequestException(
            `This adjustment (${dto.quantityChange}) would take stock below zero.`,
          );
        }

        const adjustment = await tx.stockAdjustment.create({
          data: {
            productId: dto.productId,
            locationId: dto.locationId,
            batchNumber,
            adjustedByUserId,
            adjustmentType: dto.adjustmentType,
            quantityChange: dto.quantityChange,
            reason: dto.reason,
          },
        });

        const stock = await tx.inventoryStock.findUniqueOrThrow({
          where: { id: stockId },
          include: { product: true, location: true },
        });

        return { stock, adjustment };
      });

      // Best-effort, outside the transaction on purpose — see
      // AlertsService.maybeTriggerLowStockAlert's own comment on why this
      // must never be able to fail the adjustment itself.
      await this.alerts.maybeTriggerLowStockAlert(result.stock, quantityBefore);

      return result;
    } catch (err) {
      throw toHttpException(err, 'Stock adjustment');
    }
  }

  async history(stockId: number, query: QueryAdjustmentsDto) {
    const stock = await this.prisma.inventoryStock.findUnique({
      where: { id: stockId },
    });
    if (!stock) throw new NotFoundException('Stock record not found.');

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = {
      productId: stock.productId,
      locationId: stock.locationId,
      batchNumber: stock.batchNumber,
    };

    const [data, total] = await Promise.all([
      this.prisma.stockAdjustment.findMany({
        where,
        include: {
          adjustedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockAdjustment.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /** Exported for unit testing without a database — see inventory.service.spec.ts. */
  assertSignMatchesType(type: AdjustmentType, quantityChange: number): void {
    if (type === 'restock' && quantityChange < 0) {
      throw new BadRequestException(
        'A restock must have a positive quantityChange.',
      );
    }
    if ((type === 'damage' || type === 'expired') && quantityChange > 0) {
      throw new BadRequestException(
        `A '${type}' adjustment must have a negative quantityChange.`,
      );
    }
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
