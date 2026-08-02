import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL_SECONDS = 300; // 5 min — short enough that a role/permission
// edit shows up quickly without hammering Postgres on every request.

function cacheKey(roleName: string) {
  return `role_permissions:${roleName}`;
}

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Permission codes for a single role, e.g. ['product:view', 'stock:adjust']. */
  async getPermissionsForRole(roleName: string): Promise<string[]> {
    const cached = await this.redis.client.get(cacheKey(roleName));
    if (cached) return JSON.parse(cached) as string[];

    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
      include: { permissions: { include: { permission: true } } },
    });
    const codes = role?.permissions.map((rp) => rp.permission.code) ?? [];

    await this.redis.client.set(
      cacheKey(roleName),
      JSON.stringify(codes),
      'EX',
      CACHE_TTL_SECONDS,
    );
    return codes;
  }

  /** Union of permissions across every role a user holds. */
  async getPermissionsForRoles(roleNames: string[]): Promise<Set<string>> {
    const lists = await Promise.all(
      roleNames.map((r) => this.getPermissionsForRole(r)),
    );
    return new Set(lists.flat());
  }

  /** Call after any Role/Permission/RolePermission write so cache can't go stale. */
  async invalidateRole(roleName: string): Promise<void> {
    await this.redis.client.del(cacheKey(roleName));
  }
}
