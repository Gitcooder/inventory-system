import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

// NOTE: same sandbox-only Prisma-stub situation as categories.service.spec.ts
// — the mock below is untyped because PrismaService itself types as `any`
// here (see README). Resolves automatically after `npx prisma generate`.
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

function buildMockAlerts() {
  return { maybeTriggerLowStockAlert: jest.fn().mockResolvedValue(undefined) };
}

function buildMockPrisma(opts: {
  productExists?: boolean;
  locationExists?: boolean;
  /** Simulates the INSERT ... ON CONFLICT DO NOTHING RETURNING id result. */
  insertReturnsRow?: boolean;
  /** Only consulted when insertReturnsRow is false (row already existed). */
  existingStockId?: number;
  /** Simulates $executeRaw's affected-row count for the conditional UPDATE. */
  updateAffectedRows?: number;
}) {
  const {
    productExists = true,
    locationExists = true,
    insertReturnsRow = true,
    existingStockId = 42,
    updateAffectedRows = 1,
  } = opts;

  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(insertReturnsRow ? [{ id: 7 }] : []),
    $executeRaw: jest.fn().mockResolvedValue(updateAffectedRows),
    inventoryStock: {
      findUnique: jest
        .fn()
        .mockResolvedValue(insertReturnsRow ? null : { id: existingStockId }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: insertReturnsRow ? 7 : existingStockId,
        quantity: 10,
      }),
    },
    stockAdjustment: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
    },
  };

  return {
    product: {
      findUnique: jest.fn().mockResolvedValue(productExists ? { id: 1 } : null),
    },
    location: {
      findUnique: jest
        .fn()
        .mockResolvedValue(locationExists ? { id: 1 } : null),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    _tx: tx,
  };
}

describe('InventoryService.assertSignMatchesType', () => {
  it('rejects a restock with a negative quantityChange', () => {
    const service = new InventoryService(buildMockPrisma({}));
    expect(() => service.assertSignMatchesType('restock', -5)).toThrow(
      BadRequestException,
    );
  });

  it('rejects damage/expired with a positive quantityChange', () => {
    const service = new InventoryService(buildMockPrisma({}));
    expect(() => service.assertSignMatchesType('damage', 5)).toThrow(
      BadRequestException,
    );
    expect(() => service.assertSignMatchesType('expired', 5)).toThrow(
      BadRequestException,
    );
  });

  it('allows a correction in either direction', () => {
    const service = new InventoryService(buildMockPrisma({}));
    expect(() => service.assertSignMatchesType('correction', 5)).not.toThrow();
    expect(() => service.assertSignMatchesType('correction', -5)).not.toThrow();
  });

  it('allows restock positive and damage/expired negative', () => {
    const service = new InventoryService(buildMockPrisma({}));
    expect(() => service.assertSignMatchesType('restock', 5)).not.toThrow();
    expect(() => service.assertSignMatchesType('damage', -5)).not.toThrow();
    expect(() => service.assertSignMatchesType('expired', -5)).not.toThrow();
  });
});

describe('InventoryService.adjust', () => {
  it('rejects an adjustment that would take stock negative', async () => {
    const prisma = buildMockPrisma({ updateAffectedRows: 0 });
    const service = new InventoryService(prisma, buildMockAlerts());
    await expect(
      service.adjust(
        {
          productId: 1,
          locationId: 1,
          adjustmentType: 'correction',
          quantityChange: -999,
        },
        1,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('404s when the product does not exist', async () => {
    const prisma = buildMockPrisma({ productExists: false });
    const service = new InventoryService(prisma, buildMockAlerts());
    await expect(
      service.adjust(
        {
          productId: 1,
          locationId: 1,
          adjustmentType: 'restock',
          quantityChange: 5,
        },
        1,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('404s when the location does not exist', async () => {
    const prisma = buildMockPrisma({ locationExists: false });
    const service = new InventoryService(prisma, buildMockAlerts());
    await expect(
      service.adjust(
        {
          productId: 1,
          locationId: 1,
          adjustmentType: 'restock',
          quantityChange: 5,
        },
        1,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates the stock row on first adjustment (insert path) and logs the adjustment', async () => {
    const prisma = buildMockPrisma({
      insertReturnsRow: true,
      updateAffectedRows: 1,
    });
    const service = new InventoryService(prisma, buildMockAlerts());
    const result = await service.adjust(
      {
        productId: 1,
        locationId: 1,
        adjustmentType: 'restock',
        quantityChange: 10,
      },
      99,
    );
    expect(prisma._tx.inventoryStock.findUnique).not.toHaveBeenCalled(); // insert succeeded, no fallback lookup needed
    expect(prisma._tx.stockAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adjustedByUserId: 99,
          adjustmentType: 'restock',
        }),
      }),
    );
    expect(result).toHaveProperty('stock');
    expect(result).toHaveProperty('adjustment');
  });

  it('falls back to findUnique when the stock row already exists (conflict path)', async () => {
    const prisma = buildMockPrisma({
      insertReturnsRow: false,
      existingStockId: 55,
      updateAffectedRows: 1,
    });
    const service = new InventoryService(prisma, buildMockAlerts());
    await service.adjust(
      {
        productId: 1,
        locationId: 1,
        adjustmentType: 'correction',
        quantityChange: 3,
      },
      1,
    );
    expect(prisma._tx.inventoryStock.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId_locationId_batchNumber: {
            productId: 1,
            locationId: 1,
            batchNumber: 'default',
          },
        },
      }),
    );
  });
});
