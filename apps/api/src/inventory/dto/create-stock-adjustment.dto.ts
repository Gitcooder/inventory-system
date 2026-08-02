import { IsIn, IsInt, IsOptional, IsString, NotEquals } from 'class-validator';
import { ADJUSTMENT_TYPES, type AdjustmentType } from '../adjustment-type';

export class CreateStockAdjustmentDto {
  @IsInt()
  productId: number;

  @IsInt()
  locationId: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsIn(ADJUSTMENT_TYPES)
  adjustmentType: AdjustmentType;

  // Signed: positive for restock, negative for damage/expired, either for
  // correction — InventoryService.assertSignMatchesType enforces the
  // per-type sign rule server-side (a DTO-level decorator can't see
  // adjustmentType and quantityChange together).
  @IsInt()
  @NotEquals(0)
  quantityChange: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
