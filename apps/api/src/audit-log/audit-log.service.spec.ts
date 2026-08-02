import { AuditLogService } from './audit-log.service';

// Same sandbox-only Prisma-stub situation as the other *.service.spec.ts files.
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

describe('AuditLogService.record', () => {
  it('writes the entry with the given fields', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const service = new AuditLogService({ auditLog: { create } });

    await service.record({
      userId: 7,
      action: 'user.create',
      entityType: 'User',
      entityId: 42,
      newValue: { email: 'a@b.com' },
      ipAddress: '203.0.113.1',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 7,
        action: 'user.create',
        entityType: 'User',
        entityId: 42,
        newValue: { email: 'a@b.com' },
        ipAddress: '203.0.113.1',
      }),
    });
  });

  it('never throws even if the DB write fails', async () => {
    const create = jest.fn().mockRejectedValue(new Error('DB down'));
    const service = new AuditLogService({ auditLog: { create } });

    await expect(
      service.record({ userId: 1, action: 'x', entityType: 'Y' }),
    ).resolves.toBeUndefined();
  });
});

describe('AuditLogService.list', () => {
  it('filters by action, entityType, and userId when provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const service = new AuditLogService({
      auditLog: { create: jest.fn(), findMany, count },
    });

    await service.list({
      action: 'user.create',
      entityType: 'User',
      userId: 7,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: 'user.create', entityType: 'User', userId: 7 },
      }),
    );
  });
});
