import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { toHttpException } from '../common/prisma-error.util';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface LocationNode {
  id: number;
  name: string;
  type: string;
  parentLocationId: number | null;
  address: string | null;
  children: LocationNode[];
}

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  list() {
    return this.prisma.location.findMany({ orderBy: { name: 'asc' } });
  }

  /** Nested warehouse > aisle > shelf view for the Admin/Employee location
   *  pickers. Same one-query-then-nest approach as CategoriesService.tree(). */
  async tree(): Promise<LocationNode[]> {
    const flat = await this.prisma.location.findMany({
      orderBy: { name: 'asc' },
    });
    const byId = new Map<number, LocationNode>(
      flat.map((l) => [l.id, { ...l, children: [] }]),
    );
    const roots: LocationNode[] = [];
    for (const node of byId.values()) {
      if (node.parentLocationId != null && byId.has(node.parentLocationId)) {
        byId.get(node.parentLocationId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async findOne(id: number) {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) throw new NotFoundException('Location not found.');
    return location;
  }

  async create(dto: CreateLocationDto) {
    await this.assertValidParent(null, dto.parentLocationId);
    try {
      return await this.prisma.location.create({ data: dto });
    } catch (err) {
      throw toHttpException(err, 'Location');
    }
  }

  async update(id: number, dto: UpdateLocationDto) {
    if (dto.parentLocationId !== undefined) {
      await this.assertValidParent(id, dto.parentLocationId);
    }
    try {
      return await this.prisma.location.update({ where: { id }, data: dto });
    } catch (err) {
      throw toHttpException(err, 'Location');
    }
  }

  /** Hard delete. Children get SetNull'd (see schema). Phase 3 adds
   *  inventory_stocks referencing locations — that FK will block deleting a
   *  location that still holds stock, the same way products block brands. */
  async remove(id: number, actorUserId: number, ipAddress?: string) {
    try {
      const location = await this.prisma.location.delete({ where: { id } });
      await this.auditLog.record({
        userId: actorUserId,
        action: 'location.delete',
        entityType: 'Location',
        entityId: id,
        oldValue: { name: location.name },
        ipAddress,
      });
    } catch (err) {
      throw toHttpException(err, 'Location');
    }
  }

  private async assertValidParent(
    locationId: number | null,
    parentLocationId?: number,
  ) {
    if (parentLocationId == null) return;
    if (locationId != null && parentLocationId === locationId) {
      throw new BadRequestException('A location cannot be its own parent.');
    }
    let current: number | null = parentLocationId;
    const seen = new Set<number>();
    while (current != null) {
      if (locationId != null && current === locationId) {
        throw new BadRequestException(
          'That would create a circular location hierarchy.',
        );
      }
      if (seen.has(current)) break;
      seen.add(current);
      const parent = await this.prisma.location.findUnique({
        where: { id: current },
        select: { parentLocationId: true },
      });
      if (!parent) {
        throw new BadRequestException(
          'parentLocationId does not reference an existing location.',
        );
      }
      current = parent.parentLocationId;
    }
  }
}
