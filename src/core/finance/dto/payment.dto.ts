import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

const METHODS = ['cash', 'check', 'wire', 'card', 'mobile_money', 'other'] as const;
const STATUSES = ['pending', 'received', 'reconciled', 'refunded', 'cancelled'] as const;

type PaymentMethodDto = (typeof METHODS)[number];
type PaymentStatusDto = (typeof STATUSES)[number];

export class CreatePaymentDto {
  @IsOptional() @IsUUID() invoiceId?: string | null;
  @IsOptional() @IsUUID() contactId?: string | null;

  @IsOptional() @IsDateString() paymentDate?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;

  @IsOptional() @IsString() @MaxLength(3) currency?: string;

  @IsOptional() @IsIn(METHODS as unknown as string[]) paymentMethod?: PaymentMethodDto | null;

  @IsOptional() @IsIn(STATUSES as unknown as string[]) status?: PaymentStatusDto;
}

export class UpdatePaymentDto {
  @IsOptional() @IsDateString() paymentDate?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount?: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsIn(METHODS as unknown as string[]) paymentMethod?: PaymentMethodDto | null;
  @IsOptional() @IsIn(STATUSES as unknown as string[]) status?: PaymentStatusDto;
}
