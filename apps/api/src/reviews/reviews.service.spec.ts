import { NotFoundException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

// Same sandbox-only Prisma-stub situation as the other *.service.spec.ts files.
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

function buildMockAuditLog() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

function buildMockPrisma(opts: { productExists?: boolean } = {}) {
  const { productExists = true } = opts;
  return {
    product: {
      findUnique: jest.fn().mockResolvedValue(productExists ? { id: 1 } : null),
    },
    productReview: {
      upsert: jest.fn().mockResolvedValue({ id: 10, status: 'pending' }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue({ id: 10, status: 'approved' }),
      update: jest.fn().mockResolvedValue({ id: 10, status: 'rejected' }),
    },
  };
}

describe('ReviewsService.create', () => {
  it('404s when the product does not exist', async () => {
    const service = new ReviewsService(
      buildMockPrisma({ productExists: false }),
      buildMockAuditLog(),
    );
    await expect(
      service.create(1, { productId: 1, rating: 5 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('upserts keyed on (productId, customerId), always resetting to pending', async () => {
    const prisma = buildMockPrisma();
    const service = new ReviewsService(prisma, buildMockAuditLog());
    await service.create(42, {
      productId: 1,
      rating: 4,
      reviewText: 'Works well',
    });

    expect(prisma.productReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId_customerId: { productId: 1, customerId: 42 } },
        create: expect.objectContaining({ status: 'pending', rating: 4 }),
        update: expect.objectContaining({ status: 'pending', rating: 4 }),
      }),
    );
  });
});

describe('ReviewsService.listPublic', () => {
  it('always queries status=approved regardless of what the DTO contains', async () => {
    const prisma = buildMockPrisma();
    const service = new ReviewsService(prisma, buildMockAuditLog());
    // QueryReviewsDto has no status field at all, but even if something
    // upstream slipped one in, listPublic must not forward it.
    await service.listPublic({
      productId: 1,
      ...({ status: 'pending' } as object),
    });

    expect(prisma.productReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'approved' }),
      }),
    );
  });
});

describe('ReviewsService.moderate', () => {
  it('404s when the review does not exist', async () => {
    const prisma = buildMockPrisma();
    prisma.productReview.findUnique.mockResolvedValueOnce(null);
    const service = new ReviewsService(prisma, buildMockAuditLog());
    await expect(service.moderate(999, 'approved', 1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates the status', async () => {
    const prisma = buildMockPrisma();
    const service = new ReviewsService(prisma, buildMockAuditLog());
    await service.moderate(10, 'rejected', 1);
    expect(prisma.productReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: { status: 'rejected' },
      }),
    );
  });

  it('records an audit entry with the old and new status', async () => {
    const prisma = buildMockPrisma();
    const auditLog = buildMockAuditLog();
    const service = new ReviewsService(prisma, auditLog);
    await service.moderate(10, 'rejected', 7, '203.0.113.1');
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        action: 'review.moderate',
        entityType: 'ProductReview',
        entityId: 10,
        oldValue: { status: 'approved' },
        newValue: { status: 'rejected' },
        ipAddress: '203.0.113.1',
      }),
    );
  });
});
