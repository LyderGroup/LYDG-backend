import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CONFIDENTIALITY_LEVELS } from '../documents.permissions';

export class CreateFolderDto {
  @IsUUID() libraryId!: string;
  @IsOptional() @IsUUID() parentFolderId?: string | null;
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(CONFIDENTIALITY_LEVELS as unknown as string[]) confidentialityLevel?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class UpdateFolderDto {
  @IsOptional() @IsUUID() parentFolderId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(CONFIDENTIALITY_LEVELS as unknown as string[]) confidentialityLevel?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}
