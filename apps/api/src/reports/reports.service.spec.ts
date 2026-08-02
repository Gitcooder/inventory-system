import { ReportsService } from './reports.service';

// Same sandbox-only Prisma-stub situation as the other *.service.spec.ts files.

function buildMockPrisma() {
  return {
    usageLog: {
      groupBy: jest.fn().mockResolvedValue([
        { productId: 1, _count: { id: 5 }, _sum: { quantityUsed: 50 } },
        { productId: 2, _count: { id: 2 }, _sum: { quantityUsed: 4 } },
        // productId 3 has usage history but wasn't returned by the product
        // lookup below — guards the join against a stale/missing FK target
        // rather than crashing or silently dropping the row.
        { productId: 3, _count: { id: 1 }, _sum: { quantityUsed: 1 } },
      ]),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([
        { id: 1, name: 'Amoxicillin 500mg', skuCode: 'AMX-500' },
        { id: 2, name: 'Ibuprofen 200mg', skuCode: 'IBU-200' },
      ]),
    },
  };
}

describe('ReportsService.usageSummary', () => {
  it('joins product name/SKU onto each aggregated row, preserving groupBy order', async () => {
    const service = new ReportsService(buildMockPrisma());
    const result = await service.usageSummary({});

    expect(result).toEqual([
      {
        productId: 1,
        productName: 'Amoxicillin 500mg',
        skuCode: 'AMX-500',
        timesDispensed: 5,
        totalQuantityDispensed: 50,
      },
      {
        productId: 2,
        productName: 'Ibuprofen 200mg',
        skuCode: 'IBU-200',
        timesDispensed: 2,
        totalQuantityDispensed: 4,
      },
      {
        productId: 3,
        productName: '#3 (deleted)',
        skuCode: '',
        timesDispensed: 1,
        totalQuantityDispensed: 1,
      },
    ]);
  });

  it('passes a date range through to the groupBy where clause', async () => {
    const prisma = buildMockPrisma();
    const service = new ReportsService(prisma);
    await service.usageSummary({ from: '2026-01-01', to: '2026-01-31' });

    expect(prisma.usageLog.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          timestamp: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-01-31'),
          },
        },
      }),
    );
  });

  it('omits the where clause entirely when no date range is given', async () => {
    const prisma = buildMockPrisma();
    const service = new ReportsService(prisma);
    await service.usageSummary({});

    expect(prisma.usageLog.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});
