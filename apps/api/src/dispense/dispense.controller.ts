import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { DispenseService } from './dispense.service';
import { CreateDispenseDto } from './dto/create-dispense.dto';
import { QueryDispenseDto } from './dto/query-dispense.dto';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('dispense')
export class DispenseController {
  constructor(private readonly dispense: DispenseService) {}

  @RequirePermissions('dispense:view')
  @Get()
  list(@Query() query: QueryDispenseDto) {
    return this.dispense.list(query);
  }

  @RequirePermissions('dispense:view')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.dispense.findOne(id);
  }

  @RequirePermissions('dispense:create')
  @Post()
  create(
    @Body() dto: CreateDispenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispense.dispense(dto, user.id);
  }
}
