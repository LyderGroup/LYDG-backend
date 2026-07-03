import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const SESSION_STATUS = ['planned', 'open', 'in_progress', 'completed', 'cancelled'] as const;

export class CreateCourseSessionDto {
  @IsString() @MaxLength(255) title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsUUID() courseId?: string | null;
  @IsOptional() @IsDateString() startDate?: string | null;
  @IsOptional() @IsDateString() endDate?: string | null;
  @IsOptional() @IsString() @MaxLength(255) location?: string | null;
  @IsOptional() @IsString() @MaxLength(255) instructor?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) costPerParticipant?: number | null;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

export class UpdateCourseSessionDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsUUID() courseId?: string | null;
  @IsOptional() @IsDateString() startDate?: string | null;
  @IsOptional() @IsDateString() endDate?: string | null;
  @IsOptional() @IsString() @MaxLength(255) location?: string | null;
  @IsOptional() @IsString() @MaxLength(255) instructor?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) costPerParticipant?: number | null;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsIn(SESSION_STATUS as unknown as string[]) status?: string;
}
