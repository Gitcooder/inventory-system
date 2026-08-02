import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  skuCode: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsInt()
  brandId: number;

  @IsInt()
  categoryId: number;

  @IsOptional()
  @IsString()
  usesDescription?: string;

  @IsOptional()
  @IsString()
  unitOfMeasure?: string;
}
