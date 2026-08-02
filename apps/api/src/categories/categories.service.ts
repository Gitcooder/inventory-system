import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { toHttpException } from '../common/prisma-error.util';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface CategoryNode {
  id: number;
  name: string;
  description: string | null;
  parentCategoryId: number | null;
  children: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  list() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  /** Nested view for tree-picker UIs. Fetches flat (one query) and nests in
   *  JS rather than N+1 recursive queries — fine at catalog scale. */
  async tree(): Promise<CategoryNode[]> {
    const flat = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    const byId = new Map<number, CategoryNode>(
      flat.map((c) => [c.id, { ...c, children: [] }]),
    );
    const roots: CategoryNode[] = [];
    for (const node of byId.values()) {
      if (node.parentCategoryId != null && byId.has(node.parentCategoryId)) {
        byId.get(node.parentCategoryId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found.');
    return category;
  }

  async create(dto: CreateCategoryDto) {
    await this.assertValidParent(null, dto.parentCategoryId);
    try {
      return await this.prisma.category.create({ data: dto });
    } catch (err) {
      throw toHttpException(err, 'Category');
    }
  }

  async update(id: number, dto: UpdateCategoryDto) {
    if (dto.parentCategoryId !== undefined) {
      await this.assertValidParent(id, dto.parentCategoryId);
    }
    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (err) {
      throw toHttpException(err, 'Category');
    }
  }

  /** Hard delete. Children get SetNull'd to top-level (see schema); blocked
   *  with a 409 if any product still references this category directly. */
  async remove(id: number, actorUserId: number, ipAddress?: string) {
    try {
      const category = await this.prisma.category.delete({ where: { id } });
      await this.auditLog.record({
        userId: actorUserId,
        action: 'category.delete',
        entityType: 'Category',
        entityId: id,
        oldValue: { name: category.name },
        ipAddress,
      });
    } catch (err) {
      throw toHttpException(err, 'Category');
    }
  }

  /** Walks up from the proposed parent to make sure `categoryId` doesn't
   *  appear in its own ancestor chain — otherwise the tree stops being a
   *  tree. `categoryId` is null when creating (a brand-new row can't yet be
   *  anyone's ancestor, so only self-reference via a client-supplied id is
   *  impossible — nothing to check). */
  private async assertValidParent(
    categoryId: number | null,
    parentCategoryId?: number,
  ) {
    if (parentCategoryId == null) return;
    if (categoryId != null && parentCategoryId === categoryId) {
      throw new BadRequestException('A category cannot be its own parent.');
    }
    let current: number | null = parentCategoryId;
    const seen = new Set<number>();
    while (current != null) {
      if (categoryId != null && current === categoryId) {
        throw new BadRequestException(
          'That would create a circular category hierarchy.',
        );
      }
      if (seen.has(current)) break; // pre-existing corrupt data — bail rather than loop forever
      seen.add(current);
      const parent = await this.prisma.category.findUnique({
        where: { id: current },
        select: { parentCategoryId: true },
      });
      if (!parent) {
        throw new BadRequestException(
          'parentCategoryId does not reference an existing category.',
        );
      }
      current = parent.parentCategoryId;
    }
  }
}
