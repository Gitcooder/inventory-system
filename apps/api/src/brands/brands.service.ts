import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { toHttpException } from '../common/prisma-error.util';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class BrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  list() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: number) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found.');
    return brand;
  }

  async create(dto: CreateBrandDto) {
    try {
      return await this.prisma.brand.create({ data: dto });
    } catch (err) {
      throw toHttpException(err, 'Brand');
    }
  }

  async update(id: number, dto: UpdateBrandDto) {
    try {
      return await this.prisma.brand.update({ where: { id }, data: dto });
    } catch (err) {
      throw toHttpException(err, 'Brand');
    }
  }

  /** Hard delete — brands carry no history of their own. Blocked with a 409
   *  by the FK constraint (via toHttpException) if any product still
   *  references it; reassign those products first. */
  async remove(id: number, actorUserId: number, ipAddress?: string) {
    try {
      const brand = await this.prisma.brand.delete({ where: { id } });
      await this.auditLog.record({
        userId: actorUserId,
        action: 'brand.delete',
        entityType: 'Brand',
        entityId: id,
        oldValue: { name: brand.name },
        ipAddress,
      });
    } catch (err) {
      throw toHttpException(err, 'Brand');
    }
  }
}
