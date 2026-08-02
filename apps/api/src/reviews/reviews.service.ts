import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { QueryModerationDto } from './dto/query-moderation.dto';
import { toHttpException } from '../common/prisma-error.util';
import type { ReviewStatus } from './review-status';
import { AuditLogService } from '../audit-log/audit-log.service';

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Public listing — status is hardcoded to 'approved' here, not taken from
   * the caller, so there is no query-string trick that reaches a pending or
   * rejected review through this endpoint. The moderation queue below is the
   * only place those become visible, and it's permission-gated.
   */
  async listPublic(query: QueryReviewsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = {
      status: 'approved' as ReviewStatus,
      ...(query.productId ? { productId: query.productId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        // Reviewer's name only, not email — this listing is public.
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.productReview.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Create or resubmit. A customer can only ever have one review per product
   * (see the @@unique in schema.prisma) — submitting again updates their
   * existing review and resets it to 'pending' for re-moderation, rather
   * than rejecting the second submission outright.
   */
  async create(customerId: number, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException('Product not found.');

    try {
      return await this.prisma.productReview.upsert({
        where: {
          productId_customerId: { productId: dto.productId, customerId },
        },
        create: {
          productId: dto.productId,
          customerId,
          rating: dto.rating,
          reviewText: dto.reviewText,
          status: 'pending',
        },
        update: {
          rating: dto.rating,
          reviewText: dto.reviewText,
          status: 'pending',
        },
      });
    } catch (err) {
      throw toHttpException(err, 'Review');
    }
  }

  /** Moderation queue — defaults to 'pending' (the actionable queue), but any
   *  status can be requested for a fuller audit view. */
  async listForModeration(query: QueryModerationDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = {
      status: query.status ?? 'pending',
      ...(query.productId ? { productId: query.productId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        include: {
          product: true,
          customer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.productReview.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async moderate(
    id: number,
    status: Exclude<ReviewStatus, 'pending'>,
    actorUserId: number,
    ipAddress?: string,
  ) {
    const review = await this.prisma.productReview.findUnique({
      where: { id },
    });
    if (!review) throw new NotFoundException('Review not found.');

    const updated = await this.prisma.productReview.update({
      where: { id },
      data: { status },
      include: {
        product: true,
        customer: { select: { id: true, name: true, email: true } },
      },
    });

    await this.auditLog.record({
      userId: actorUserId,
      action: 'review.moderate',
      entityType: 'ProductReview',
      entityId: id,
      oldValue: { status: review.status },
      newValue: { status },
      ipAddress,
    });

    return updated;
  }
}
