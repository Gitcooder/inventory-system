import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DispenseService } from './dispense.service';

// Same sandbox-only Prisma-stub situation as inventory.service.spec.ts.
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

function buildMockAlerts() {
  return { maybeTriggerLowStockAlert: jest.fn().mockResolvedValue(undefined) };
}

function buildMockPrisma(opts: {
  productExists?: boolean;
  locationExists?: boolean;
  /** Rows returned by the `SELECT ... FOR UPDATE` — empty means no stock row exists yet. */
  lockedRows?: { id: number; quantity: number }[];
}) {
  const {
    productExists = true,
    locationExists = true,
    lockedRows = [{ id: 7, quantity: 10 }],
  } = opts;

  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(lockedRows),
    inventoryStock: {
      update: jest.fn().mockResolvedValue({ id: 7 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 7, quantity: 5 }),
    },
    usageLog: {
      create: jest.fn().mockResolvedValue({ id: 1, quantityUsed: 5 }),
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

describe('DispenseService.dispense', () => {
  it('404s when the product does not exist', async () => {
    const service = new DispenseService(
      buildMockPrisma({ productExists: false }),
      buildMockAlerts(),
    );
    await expect(
      service.dispense({ productId: 1, locationId: 1, quantityUsed: 1 }, 1),
    ).rejects.toThrow(NotFoundException);
  });

  it('404s when the location does not exist', async () => {
    const service = new DispenseService(
      buildMockPrisma({ locationExists: false }),
      buildMockAlerts(),
    );
    await expect(
      service.dispense({ productId: 1, locationId: 1, quantityUsed: 1 }, 1),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects dispensing when no stock row exists for the product/location', async () => {
    const service = new DispenseService(
      buildMockPrisma({ lockedRows: [] }),
      buildMockAlerts(),
    );
    await expect(
      service.dispense({ productId: 1, locationId: 1, quantityUsed: 1 }, 1),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects dispensing more than is available (insufficient stock)', async () => {
    const prisma = buildMockPrisma({ lockedRows: [{ id: 7, quantity: 3 }] });
    const service = new DispenseService(prisma, buildMockAlerts());
    await expect(
      service.dispense({ productId: 1, locationId: 1, quantityUsed: 10 }, 1),
    ).rejects.toThrow(BadRequestException);
    // The whole point of the lock: never decrement when we're about to reject.
    expect(prisma._tx.inventoryStock.update).not.toHaveBeenCalled();
    expect(prisma._tx.usageLog.create).not.toHaveBeenCalled();
  });

  it('allows dispensing exactly the remaining quantity (boundary: 0 left after)', async () => {
    const prisma = buildMockPrisma({ lockedRows: [{ id: 7, quantity: 5 }] });
    const service = new DispenseService(prisma, buildMockAlerts());
    await expect(
      service.dispense({ productId: 1, locationId: 1, quantityUsed: 5 }, 42),
    ).resolves.toHaveProperty('usageLog');
    expect(prisma._tx.inventoryStock.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 5 } } }),
    );
  });

  it('records the dispensing user on the usage log', async () => {
    const prisma = buildMockPrisma({ lockedRows: [{ id: 7, quantity: 10 }] });
    const service = new DispenseService(prisma, buildMockAlerts());
    await service.dispense(
      {
        productId: 1,
        locationId: 1,
        quantityUsed: 2,
        purposeDescription: 'Ward 3 restock',
      },
      42,
    );
    expect(prisma._tx.usageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 42,
          quantityUsed: 2,
          purposeDescription: 'Ward 3 restock',
        }),
      }),
    );
  });

  it('triggers the low-stock alert check with the pre-decrement quantity', async () => {
    const prisma = buildMockPrisma({ lockedRows: [{ id: 7, quantity: 5 }] });
    const alerts = buildMockAlerts();
    const service = new DispenseService(prisma, alerts);
    await service.dispense({ productId: 1, locationId: 1, quantityUsed: 5 }, 1);
    expect(alerts.maybeTriggerLowStockAlert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      5, // quantityBefore — the value SELECT ... FOR UPDATE returned, not the post-decrement one
    );
  });
});
