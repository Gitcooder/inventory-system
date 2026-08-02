import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryAlertsDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  productId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  locationId?: number;

  // ?acknowledged=false is the default "what still needs attention" view.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  acknowledged?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
