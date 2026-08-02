import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { toHttpException } from '../common/prisma-error.util';
import { AuditLogService } from '../audit-log/audit-log.service';

const DEFAULT_PAGE_SIZE = 20;
const CACHE_VERSION_KEY = 'products:cache-version';
// Safety-net TTL on top of version-based invalidation — if a write's cache
// bump ever silently fails (see bumpCacheVersion), a stale entry can't live
// longer than this before self-correcting.
const CACHE_TTL_SECONDS = 300;

/**
 * Redis-backed cache-aside for the product catalog reads — the specific
 * caching the architecture doc calls out for the Customer storefront (§7.3:
 * "serving catalog data directly from Redis memory rather than burdening the
 * primary relational database"). Every write bumps a version counter rather
 * than trying to enumerate and delete affected keys (no SCAN/KEYS in
 * production Redis) — old-version keys just age out via their TTL.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(query: QueryProductsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const cacheKey = await this.buildCacheKey('list', JSON.stringify(query));
    const cached = await this.readCache<{
      data: unknown[];
      total: number;
      page: number;
      pageSize: number;
    }>(cacheKey);
    if (cached) return cached;

    // Not explicitly typed as Prisma.ProductWhereInput: this file needs to
    // build even against an ungenerated client (see README's sandbox note).
    // It's still fully checked — as the `where` argument at the findMany/count
    // call sites below — once a real client is generated.
    const where = {
      // Default to active-only so deactivated products don't clutter normal
      // browsing; pass ?isActive=false explicitly to see the deactivated set.
      isActive: query.isActive ?? true,
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { skuCode: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { brand: true, category: true },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    const result = { data, total, page, pageSize };
    await this.writeCache(cacheKey, result);
    return result;
  }

  async findOne(id: number) {
    const cacheKey = await this.buildCacheKey('item', String(id));
    const cached = await this.readCache(cacheKey);
    if (cached) return cached;

    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { brand: true, category: true },
    });
    if (!product) throw new NotFoundException('Product not found.');

    await this.writeCache(cacheKey, product);
    return product;
  }

  async findBySku(skuCode: string) {
    const cacheKey = await this.buildCacheKey('sku', skuCode);
    const cached = await this.readCache(cacheKey);
    if (cached) return cached;

    const product = await this.prisma.product.findUnique({
      where: { skuCode },
      include: { brand: true, category: true },
    });
    if (!product) throw new NotFoundException('Product not found.');

    await this.writeCache(cacheKey, product);
    return product;
  }

  /**
   * The "everything about this product" internal view — architecture.md
   * §7.4's four-step data-gathering sequence (metadata, live stock,
   * usage aggregation, chronological ledger), plus stock-adjustment and
   * review summaries the original draft didn't call out but which round out
   * the same "holistic profile" goal. Deliberately NOT cached like the
   * public reads above: this is a low-traffic internal admin view where
   * staleness would be actively unhelpful (it exists specifically so staff
   * can trust the numbers are current), not a high-traffic public one.
   */
  async getDetails(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { brand: true, category: true },
    });
    if (!product) throw new NotFoundException('Product not found.');

    const [
      stockByLocation,
      usageAggregate,
      usageLedger,
      adjustmentLedger,
      reviewAggregate,
    ] = await Promise.all([
      this.prisma.inventoryStock.findMany({
        where: { productId: id },
        include: { location: true },
        orderBy: { locationId: 'asc' },
      }),
      this.prisma.usageLog.aggregate({
        where: { productId: id },
        _count: { id: true },
        _sum: { quantityUsed: true },
      }),
      this.prisma.usageLog.findMany({
        where: { productId: id },
        include: { user: { select: { id: true, name: true } }, location: true },
        orderBy: { timestamp: 'desc' },
        take: 20,
      }),
      this.prisma.stockAdjustment.findMany({
        where: { productId: id },
        include: {
          adjustedBy: { select: { id: true, name: true } },
          location: true,
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
      }),
      this.prisma.productReview.aggregate({
        where: { productId: id, status: 'approved' },
        _count: { id: true },
        _avg: { rating: true },
      }),
    ]);

    return {
      product,
      stockByLocation,
      totalStock: stockByLocation.reduce((sum, s) => sum + s.quantity, 0),
      usageSummary: {
        timesDispensed: usageAggregate._count.id,
        totalQuantityDispensed: usageAggregate._sum.quantityUsed ?? 0,
      },
      usageLedger,
      adjustmentLedger,
      reviewSummary: {
        approvedCount: reviewAggregate._count.id,
        averageRating: reviewAggregate._avg.rating,
      },
    };
  }

  async create(dto: CreateProductDto) {
    try {
      const product = await this.prisma.product.create({
        data: dto,
        include: { brand: true, category: true },
      });
      await this.bumpCacheVersion();
      return product;
    } catch (err) {
      throw toHttpException(err, 'Product');
    }
  }

  async update(id: number, dto: UpdateProductDto) {
    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: dto,
        include: { brand: true, category: true },
      });
      await this.bumpCacheVersion();
      return product;
    } catch (err) {
      throw toHttpException(err, 'Product');
    }
  }

  /** Products are never hard-deleted — once usage_logs exists (Phase 4) a
   *  real DELETE would be blocked by the FK anyway, so the API doesn't offer
   *  one at all. This is the only way to retire a product. */
  async setStatus(
    id: number,
    isActive: boolean,
    actorUserId: number,
    ipAddress?: string,
  ) {
    try {
      const before = await this.prisma.product.findUnique({ where: { id } });
      const product = await this.prisma.product.update({
        where: { id },
        data: { isActive },
        include: { brand: true, category: true },
      });
      await this.bumpCacheVersion();
      await this.auditLog.record({
        userId: actorUserId,
        action: 'product.status_change',
        entityType: 'Product',
        entityId: id,
        oldValue: before ? { isActive: before.isActive } : undefined,
        newValue: { isActive },
        ipAddress,
      });
      return product;
    } catch (err) {
      throw toHttpException(err, 'Product');
    }
  }

  // --- Cache helpers ---
  // All best-effort: a Redis hiccup here degrades to an uncached DB read
  // (readCache) or a slightly-longer-lived stale entry (bumpCacheVersion),
  // never a failed request.

  private async getCacheVersion(): Promise<number> {
    try {
      const v = await this.redis.client.get(CACHE_VERSION_KEY);
      return v ? Number(v) : 0;
    } catch {
      return 0;
    }
  }

  private async bumpCacheVersion(): Promise<void> {
    try {
      await this.redis.client.incr(CACHE_VERSION_KEY);
    } catch {
      // swallow — see class-level comment
    }
  }

  private async buildCacheKey(
    kind: string,
    discriminator: string,
  ): Promise<string> {
    const version = await this.getCacheVersion();
    return `products:${kind}:v${version}:${discriminator}`;
  }

  private async readCache<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, value: unknown): Promise<void> {
    try {
      await this.redis.client.set(
        key,
        JSON.stringify(value),
        'EX',
        CACHE_TTL_SECONDS,
      );
    } catch {
      // swallow — see class-level comment
    }
  }
}
