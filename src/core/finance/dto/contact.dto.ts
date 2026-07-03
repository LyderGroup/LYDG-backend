import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const STATUS_VALUES = ['active', 'prospect', 'inactive', 'blocked'] as const;
type ContactStatusDto = (typeof STATUS_VALUES)[number];

export class CreateContactDto {
  @IsOptional() @IsUUID() contactTypeId?: string | null;
  @IsOptional() @IsUUID() categoryId?: string | null;

  @IsOptional() @IsBoolean() isCustomer?: boolean;
  @IsOptional() @IsBoolean() isSupplier?: boolean;
  @IsOptional() @IsBoolean() isPartner?: boolean;

  @IsOptional() @IsString() @MaxLength(255) companyName?: string | null;
  @IsOptional() @IsString() @MaxLength(100) firstName?: string | null;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string | null;

  @IsOptional() @IsEmail() @MaxLength(255) email?: string | null;
  @IsOptional() @IsString() @MaxLength(20) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(100) city?: string | null;
  @IsOptional() @IsString() @MaxLength(100) country?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(365) paymentTermsDays?: number;
  @IsOptional() @IsUUID() assignedTo?: string | null;

  @IsOptional() @IsIn(STATUS_VALUES as unknown as string[]) customerStatus?: ContactStatusDto;
}

export class UpdateContactDto {
  @IsOptional() @IsUUID() contactTypeId?: string | null;
  @IsOptional() @IsUUID() categoryId?: string | null;

  @IsOptional() @IsBoolean() isCustomer?: boolean;
  @IsOptional() @IsBoolean() isSupplier?: boolean;
  @IsOptional() @IsBoolean() isPartner?: boolean;

  @IsOptional() @IsString() @MaxLength(255) companyName?: string | null;
  @IsOptional() @IsString() @MaxLength(100) firstName?: string | null;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string | null;

  @IsOptional() @IsEmail() @MaxLength(255) email?: string | null;
  @IsOptional() @IsString() @MaxLength(20) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(100) city?: string | null;
  @IsOptional() @IsString() @MaxLength(100) country?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(365) paymentTermsDays?: number;
  @IsOptional() @IsUUID() assignedTo?: string | null;

  @IsOptional() @IsIn(STATUS_VALUES as unknown as string[]) customerStatus?: ContactStatusDto;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
