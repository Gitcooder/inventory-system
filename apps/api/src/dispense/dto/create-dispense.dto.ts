import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDispenseDto {
  @IsInt()
  productId: number;

  @IsInt()
  locationId: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsInt()
  @Min(1)
  @Max(100_000)
  quantityUsed: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  purposeDescription?: string;
}
