import { IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

// Kept as a plain string column in the DB (see schema.prisma comment) but
// validated against a known set here so the API rejects typos/garbage early
// without a migration every time a new location type is needed later.
export const LOCATION_TYPES = [
  'warehouse',
  'branch',
  'aisle',
  'shelf',
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export class CreateLocationDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsIn(LOCATION_TYPES)
  type: LocationType;

  @IsOptional()
  @IsInt()
  parentLocationId?: number;

  @IsOptional()
  @IsString()
  address?: string;
}
