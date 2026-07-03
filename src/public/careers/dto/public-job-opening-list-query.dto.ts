/**
 * Public DTO: Job Opening List Query Parameters
 * 
 * Utilisé pour /GET /public/careers/jobs
 * Filtre les offres publiques avec pagination et recherche
 */

import { IsOptional, IsString, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export type JobOpeningSortField = 'publishedAt' | 'openingDate' | 'jobTitle' | 'salaryRangeMin';
export type SortDirection = 'ASC' | 'DESC';

export class PublicJobOpeningListQueryDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  employmentType?: string;

  @IsOptional()
  @IsString()
  experienceLevel?: string;

  @IsOptional()
  @IsString()
  sort?: string = 'publishedAt:DESC'; // Format: "field:ASC" ou "field:DESC"

  /**
   * Optionnel: filter par organisation si multi-tenant public
   */
  @IsOptional()
  @IsString()
  organizationCode?: string;
}
