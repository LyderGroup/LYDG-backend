import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

const DIFFICULTY = ['beginner', 'intermediate', 'advanced', 'expert'] as const;

export class CreateCourseDto {
  @IsOptional() @IsUUID() categoryId?: string | null;

  @IsString() @MaxLength(50) code!: string;

  @IsString() @MaxLength(255) title!: string;

  @IsOptional() @IsString() description?: string | null;

  @IsOptional() @IsString() @MaxLength(10) language?: string;

  @IsOptional() @IsIn(DIFFICULTY as unknown as string[]) difficultyLevel?: string | null;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) durationHours?: number | null;

  @IsOptional() @IsUUID() ownerId?: string | null;
}

export class UpdateCourseDto {
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @IsString() @MaxLength(50) code?: string;
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() @MaxLength(10) language?: string;
  @IsOptional() @IsIn(DIFFICULTY as unknown as string[]) difficultyLevel?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) durationHours?: number | null;
  @IsOptional() @IsUUID() ownerId?: string | null;
}
