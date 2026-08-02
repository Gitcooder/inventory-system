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
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  // Public (Phase 6): brand names are customer-facing filter/browse data on
  // the storefront, same reasoning as ProductsController's read endpoints.
  @Public()
  @Get()
  list() {
    return this.brands.list();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.brands.findOne(id);
  }

  @RequirePermissions('brand:manage')
  @Post()
  create(@Body() dto: CreateBrandDto) {
    return this.brands.create(dto);
  }

  @RequirePermissions('brand:manage')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandDto) {
    return this.brands.update(id, dto);
  }

  @RequirePermissions('brand:manage')
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.brands.remove(id, actor.id, req.ip);
  }
}
