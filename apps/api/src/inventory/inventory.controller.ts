import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryStockDto } from './dto/create-inventory-stock.dto';
import { UpdateInventoryStockThresholdDto } from './dto/update-inventory-stock-threshold.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { QueryAdjustmentsDto } from './dto/query-adjustments.dto';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermissions('stock:view')
  @Get()
  list(@Query() query: QueryInventoryDto) {
    return this.inventory.list(query);
  }

  @RequirePermissions('stock:view')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.findOne(id);
  }

  @RequirePermissions('stock:view')
  @Get(':id/adjustments')
  history(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryAdjustmentsDto,
  ) {
    return this.inventory.history(id, query);
  }

  @RequirePermissions('stock:adjust')
  @Post()
  create(@Body() dto: CreateInventoryStockDto) {
    return this.inventory.create(dto);
  }

  // The main restock/correction/damage/expired action. Registered as
  // POST /inventory/adjustments rather than nested under a stock id, since
  // it may need to create the stock row rather than act on an existing one.
  @RequirePermissions('stock:adjust')
  @Post('adjustments')
  adjust(
    @Body() dto: CreateStockAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventory.adjust(dto, user.id);
  }

  @RequirePermissions('stock:adjust')
  @Patch(':id/threshold')
  updateThreshold(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInventoryStockThresholdDto,
  ) {
    return this.inventory.updateThreshold(id, dto);
  }
}
