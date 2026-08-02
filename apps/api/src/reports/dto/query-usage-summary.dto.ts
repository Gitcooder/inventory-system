import { IsDateString, IsOptional } from 'class-validator';

export class QueryUsageSummaryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
