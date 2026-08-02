import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from './rbac.service';
import { PERMISSIONS_KEY } from './permissions.decorator';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true; // no decorator = no restriction beyond auth

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) return false; // JwtAuthGuard should already have rejected this

    const granted = await this.rbac.getPermissionsForRoles(user.roles);
    const hasAll = required.every((code) => granted.has(code));

    if (!hasAll) {
      throw new ForbiddenException(
        `Missing required permission: ${required.filter((c) => !granted.has(c)).join(', ')}`,
      );
    }
    return true;
  }
}
