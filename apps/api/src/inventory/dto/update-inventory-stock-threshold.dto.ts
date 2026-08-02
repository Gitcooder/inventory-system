import { IsInt, Min } from 'class-validator';

// Deliberately only thresholdLimit — quantity is never edited directly.
// Every quantity change goes through POST /inventory/adjustments so it's
// always backed by a StockAdjustment audit record.
export class UpdateInventoryStockThresholdDto {
  @IsInt()
  @Min(0)
  thresholdLimit: number;
}
