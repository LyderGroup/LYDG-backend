import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { JobOpeningService } from '../services/job-opening.service';
import { JobOpeningStatus } from '../entities/job-opening.entity';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

class CreateJobOpeningDto {
  @IsOptional() @IsString() positionId?: string | null;
  @IsString() jobTitle!: string;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() jobDescription?: string | null;
  @IsOptional() @IsString() employmentType?: string | null;
  @IsOptional() @IsString() experienceLevel?: string | null;
  @IsOptional() @IsNumber() salaryRangeMin?: number | null;
  @IsOptional() @IsNumber() salaryRangeMax?: number | null;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsDateString() closingDate?: string | null;
}

class UpdateJobOpeningDto {
  @IsOptional() @IsString() positionId?: string | null;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() jobDescription?: string | null;
  @IsOptional() @IsString() employmentType?: string | null;
  @IsOptional() @IsString() experienceLevel?: string | null;
  @IsOptional() @IsNumber() salaryRangeMin?: number | null;
  @IsOptional() @IsNumber() salaryRangeMax?: number | null;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() closingDate?: string | null;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/job-openings')
export class JobOpeningController {
  constructor(private readonly service: JobOpeningService) { }

  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_READ, { moduleCode: 'module_c_rh' })
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const page = query.page ? parseInt(query.page as string, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit as string, 10) : undefined;
    const search = typeof query.search === 'string' ? query.search.trim() : undefined;
    const departmentId = typeof query.departmentId === 'string' ? query.departmentId : undefined;
    const status = typeof query.status === 'string' ? query.status : undefined;

    return this.service.findPage(tenant?.id as string, { page, limit, search, departmentId, status });
  }

  @Get(':id')
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_READ, { moduleCode: 'module_c_rh' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Offre d\'emploi non trouvée');
    return item;
  }

  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_WRITE, { moduleCode: 'module_c_rh' })
  async create(@Req() req: any, @Body() dto: CreateJobOpeningDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    if (!dto.jobTitle?.trim()) throw new BadRequestException('Le titre du poste est obligatoire');

    return this.service.create(tenant?.id as string, currentUser?.id as string, {
      positionId: dto.positionId ?? null,
      jobTitle: dto.jobTitle.trim(),
      departmentId: dto.departmentId ?? null,
      jobDescription: dto.jobDescription ?? null,
      employmentType: dto.employmentType ?? null,
      experienceLevel: dto.experienceLevel ?? null,
      salaryRangeMin: dto.salaryRangeMin ?? null,
      salaryRangeMax: dto.salaryRangeMax ?? null,
      currency: dto.currency ?? 'XOF',
      closingDate: dto.closingDate ? new Date(dto.closingDate) : null,
    });
  }

  @Patch(':id')
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_WRITE, { moduleCode: 'module_c_rh' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateJobOpeningDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, {
      ...dto,
      status: dto.status as JobOpeningStatus | undefined,
      closingDate: dto.closingDate ? new Date(dto.closingDate) : undefined,
    });
  }

  @Post(':id/publish')
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_MANAGE, { moduleCode: 'module_c_rh' })
  async publish(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.publish(tenant?.id as string, id);
  }

  @Post(':id/unpublish')
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_MANAGE, { moduleCode: 'module_c_rh' })
  async unpublish(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.unpublish(tenant?.id as string, id);
  }

  @Post(':id/close')
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_MANAGE, { moduleCode: 'module_c_rh' })
  async close(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.close(tenant?.id as string, id);
  }

  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_MANAGE, { moduleCode: 'module_c_rh' })
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
