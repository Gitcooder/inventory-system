import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  // Gated by 'product:view' like brands/categories — Employees need to browse
  // locations to pick a dispensing site in Phase 4, and already hold this
  // permission, so no new permission code is needed for read access.
  @RequirePermissions('product:view')
  @Get()
  list() {
    return this.locations.list();
  }

  @RequirePermissions('product:view')
  @Get('tree')
  tree() {
    return this.locations.tree();
  }

  @RequirePermissions('product:view')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.locations.findOne(id);
  }

  @RequirePermissions('location:manage')
  @Post()
  create(@Body() dto: CreateLocationDto) {
    return this.locations.create(dto);
  }

  @RequirePermissions('location:manage')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locations.update(id, dto);
  }

  @RequirePermissions('location:manage')
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.locations.remove(id, actor.id, req.ip);
  }
}
