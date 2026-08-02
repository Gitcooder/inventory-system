import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { SetProductStatusDto } from './dto/set-product-status.dto';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // Public: this is the customer storefront's product listing (Phase 6).
  // @Public() means no request.user is populated at all — see
  // ProductsService.list()'s Redis caching, which doesn't vary by caller.
  @Public()
  @Get()
  list(@Query() query: QueryProductsDto) {
    return this.products.list(query);
  }

  // Registered ahead of ':id' so the literal 'sku' segment isn't swallowed by
  // the numeric-id route — useful for Phase 4 barcode/SKU-scan lookups.
  @Public()
  @Get('sku/:skuCode')
  findBySku(@Param('skuCode') skuCode: string) {
    return this.products.findBySku(skuCode);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.products.findOne(id);
  }

  // The internal "everything about this product" view (stock by location,
  // usage totals + chronological ledger, adjustment history, review
  // summary) — architecture.md §7.4. Gated by 'stock:view' since that's the
  // narrowest permission every role that should see this already holds
  // (Admin and Employee); Customers get the public product page instead,
  // which deliberately doesn't expose internal stock/ledger data.
  @RequirePermissions('stock:view')
  @Get(':id/details')
  details(@Param('id', ParseIntPipe) id: number) {
    return this.products.getDetails(id);
  }

  @RequirePermissions('product:create')
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @RequirePermissions('product:update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  // Deactivate/reactivate is deliberately gated by 'product:delete' rather
  // than 'product:update' — retiring a product from the catalog is the
  // sensitive action the permission model is meant to separate out.
  @RequirePermissions('product:delete')
  @Patch(':id/status')
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetProductStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.products.setStatus(id, dto.isActive, actor.id, req.ip);
  }
}
