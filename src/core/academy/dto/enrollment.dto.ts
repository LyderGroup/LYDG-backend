import { IsIn, IsOptional, IsUUID } from 'class-validator';

const STATUSES = ['invited', 'enrolled', 'in_progress', 'completed', 'cancelled', 'failed'] as const;
type EnrollmentStatusDto = (typeof STATUSES)[number];

export class CreateEnrollmentDto {
  @IsUUID() courseId!: string;

  @IsOptional() @IsUUID() employeeId?: string | null;
  @IsOptional() @IsUUID() userId?: string | null;

  @IsOptional() @IsIn(STATUSES as unknown as string[]) status?: EnrollmentStatusDto;
}

export class UpdateEnrollmentDto {
  @IsOptional() @IsIn(STATUSES as unknown as string[]) status?: EnrollmentStatusDto;
}
