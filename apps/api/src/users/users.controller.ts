import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Any authenticated user can see their own profile — no extra permission needed.
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.findByIdWithRoles(user.id);
  }

  @RequirePermissions('user:manage')
  @Get()
  list() {
    return this.users.list();
  }

  @RequirePermissions('user:manage')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.users.findByIdWithRoles(id);
  }

  @RequirePermissions('user:manage')
  @Post()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.users.create(dto, actor.id, req.ip);
  }
}
