import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateInventoryStockDto {
  @IsInt()
  productId: number;

  @IsInt()
  locationId: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  thresholdLimit?: number;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;
}
