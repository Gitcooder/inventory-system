import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Role names to assign, e.g. ['Employee']. Defaults to no roles if omitted. */
  @IsArray()
  @IsString({ each: true })
  roleNames: string[];
}
