import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All roles with the permission codes attached to each — powers the
   *  role-picker in the Admin "create user" form. Role/permission editing
   *  itself is out of scope for Phase 1 (seed-managed); a write API can be
   *  added later behind 'role:manage' without changing this shape. */
  async list() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions.map((rp) => rp.permission.code),
    }));
  }
}
