import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLibraryDto {
  @IsString() @MaxLength(255) name!: string;
  @IsString() @MaxLength(50) code!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() basePath?: string | null;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateLibraryDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(50) code?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() basePath?: string | null;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
