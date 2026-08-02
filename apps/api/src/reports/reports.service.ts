import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryUsageSummaryDto } from './dto/query-usage-summary.dto';

export interface UsageSummaryRow {
  productId: number;
  productName: string;
  skuCode: string;
  timesDispensed: number;
  totalQuantityDispensed: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Total times dispensed and total quantity per product, optionally scoped
   * to a date range, sorted by volume descending — "what's actually moving"
   * is the report a procurement-focused Admin panel needs most, per
   * architecture.md §7.1's "global reporting" framing.
   */
  async usageSummary(query: QueryUsageSummaryDto): Promise<UsageSummaryRow[]> {
    const where =
      query.from || query.to
        ? {
            timestamp: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {};

    // groupBy can't include the related Product row directly, so this is a
    // two-step: aggregate first, then a single follow-up findMany to resolve
    // names/SKUs for just the products that actually appear — cheaper than
    // pulling the full catalog for what's usually a short "top movers" list.
    const grouped = await this.prisma.usageLog.groupBy({
      by: ['productId'],
      where,
      _count: { id: true },
      _sum: { quantityUsed: true },
      orderBy: { _sum: { quantityUsed: 'desc' } },
    });

    const products = (await this.prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      select: { id: true, name: true, skuCode: true },
    })) as { id: number; name: string; skuCode: string }[];
    const productById = new Map(products.map((p) => [p.id, p]));

    return grouped.map((g) => {
      const product = productById.get(g.productId);
      return {
        productId: g.productId,
        productName: product?.name ?? `#${g.productId} (deleted)`,
        skuCode: product?.skuCode ?? '',
        timesDispensed: g._count.id,
        totalQuantityDispensed: g._sum.quantityUsed ?? 0,
      };
    });
  }
}
