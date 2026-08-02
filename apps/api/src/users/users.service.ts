import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findByIdWithRoles(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      roles: user.roles.map((r) => r.role.name),
    };
  }

  async list() {
    const users = await this.prisma.user.findMany({
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      roles: u.roles.map((r) => r.role.name),
    }));
  }

  /** Admin-only. Creates a user and assigns roles by name (roles must already exist — see seed). */
  async create(dto: CreateUserDto, actorUserId: number, ipAddress?: string) {
    await this.auth.assertEmailAvailable(dto.email);
    const passwordHash = await this.auth.hashPassword(dto.password);

    const roles = await this.prisma.role.findMany({
      where: { name: { in: dto.roleNames } },
    });

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        roles: {
          create: roles.map((r) => ({ roleId: r.id })),
        },
      },
      include: { roles: { include: { role: true } } },
    });

    await this.auditLog.record({
      userId: actorUserId,
      action: 'user.create',
      entityType: 'User',
      entityId: user.id,
      newValue: { email: user.email, roles: roles.map((r) => r.name) },
      ipAddress,
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles.map((r) => r.role.name),
    };
  }
}
