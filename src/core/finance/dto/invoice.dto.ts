import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class InvoiceItemDto {
  @IsOptional() @IsUUID() productId?: string | null;

  @IsString() @MaxLength(2000) description!: string;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitPrice!: number;
}

export class CreateInvoiceDto {
  @IsUUID() contactId!: string;

  @IsOptional() @IsUUID() projectId?: string | null;

  @IsOptional() @IsDateString() issueDate?: string | null;
  @IsOptional() @IsDateString() dueDate?: string | null;

  @IsOptional() @IsString() @MaxLength(3) currency?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) taxAmount?: number;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
}

export class UpdateInvoiceDto {
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() projectId?: string | null;

  @IsOptional() @IsDateString() issueDate?: string | null;
  @IsOptional() @IsDateString() dueDate?: string | null;

  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) taxAmount?: number;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];
}
