import { AlertsService } from './alerts.service';

// Same sandbox-only Prisma-stub situation as the other *.service.spec.ts files.
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

function buildMocks(
  opts: { createShouldThrow?: boolean; publishShouldThrow?: boolean } = {},
) {
  const alertLogCreate = opts.createShouldThrow
    ? jest.fn().mockRejectedValue(new Error('DB down'))
    : jest.fn().mockResolvedValue({
        id: 99,
        triggeredAt: new Date('2026-01-01T00:00:00Z'),
      });

  const publish = opts.publishShouldThrow
    ? jest.fn().mockRejectedValue(new Error('Redis down'))
    : jest.fn().mockResolvedValue(undefined);

  const prisma = {
    alertLog: { create: alertLogCreate, findMany: jest.fn(), count: jest.fn() },
  };
  const redis = { publish };
  return { prisma, redis, alertLogCreate, publish };
}

const STOCK = {
  productId: 1,
  locationId: 2,
  quantity: 3,
  thresholdLimit: 5,
  product: { name: 'Amoxicillin 500mg' },
  location: { name: 'Main Warehouse' },
};

describe('AlertsService.maybeTriggerLowStockAlert', () => {
  it('fires when quantity crosses from above threshold to at-or-below it', async () => {
    const { prisma, redis, alertLogCreate, publish } = buildMocks();
    const service = new AlertsService(prisma, redis);

    // Was 6 (above threshold 5), now 3 (at-or-below) — a real crossing.
    await service.maybeTriggerLowStockAlert(STOCK, 6);

    expect(alertLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 1,
          locationId: 2,
          stockAtTrigger: 3,
          thresholdAtTrigger: 5,
        }),
      }),
    );
    expect(publish).toHaveBeenCalledTimes(1);
    const [channel, message] = publish.mock.calls[0] as [string, string];
    expect(channel).toBe('inventory:low_stock_alerts');
    const payload = JSON.parse(message) as Record<string, unknown>;
    expect(payload).toMatchObject({
      productId: 1,
      productName: 'Amoxicillin 500mg',
      quantity: 3,
      thresholdLimit: 5,
    });
  });

  it('does NOT fire again if stock was already at or below threshold before this change', async () => {
    const { prisma, redis, alertLogCreate, publish } = buildMocks();
    const service = new AlertsService(prisma, redis);

    // Was already 4 (at-or-below threshold 5) — not a crossing, just "still low".
    await service.maybeTriggerLowStockAlert(STOCK, 4);

    expect(alertLogCreate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('does NOT fire if the new quantity is still above threshold', async () => {
    const { prisma, redis, alertLogCreate, publish } = buildMocks();
    const service = new AlertsService(prisma, redis);
    const healthyStock = { ...STOCK, quantity: 10 };

    await service.maybeTriggerLowStockAlert(healthyStock, 12);

    expect(alertLogCreate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('fires exactly at the boundary (threshold + 1 -> threshold)', async () => {
    const { prisma, redis, alertLogCreate } = buildMocks();
    const service = new AlertsService(prisma, redis);
    const boundaryStock = { ...STOCK, quantity: 5, thresholdLimit: 5 };

    await service.maybeTriggerLowStockAlert(boundaryStock, 6);

    expect(alertLogCreate).toHaveBeenCalled();
  });

  it('never throws even if the DB write fails — alerting must not break the caller', async () => {
    const { prisma, redis } = buildMocks({ createShouldThrow: true });
    const service = new AlertsService(prisma, redis);
    await expect(
      service.maybeTriggerLowStockAlert(STOCK, 6),
    ).resolves.toBeUndefined();
  });

  it('never throws even if the Redis publish fails', async () => {
    const { prisma, redis } = buildMocks({ publishShouldThrow: true });
    const service = new AlertsService(prisma, redis);
    await expect(
      service.maybeTriggerLowStockAlert(STOCK, 6),
    ).resolves.toBeUndefined();
  });
});
