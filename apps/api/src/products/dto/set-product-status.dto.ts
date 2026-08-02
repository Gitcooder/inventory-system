import { IsBoolean } from 'class-validator';

export class SetProductStatusDto {
  @IsBoolean()
  isActive: boolean;
}
