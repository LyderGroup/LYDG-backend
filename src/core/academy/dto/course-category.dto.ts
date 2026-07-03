import { IsBoolean, IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCourseCategoryDto {
  @IsString() @MaxLength(255) name!: string;
  @IsString() @MaxLength(50) code!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsHexColor() color?: string | null;
  @IsOptional() @IsString() @MaxLength(50) icon?: string | null;
}

export class UpdateCourseCategoryDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(50) code?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsHexColor() color?: string | null;
  @IsOptional() @IsString() @MaxLength(50) icon?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
