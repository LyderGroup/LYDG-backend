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
import { JobOpeningService } from '../services/job-opening.service';
import { JobOpeningStatus } from '../entities/job-opening.entity';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';

class CreateJobOpeningDto {
  positionId?: string | null;
  jobTitle!: string;
  departmentId?: string | null;
  jobDescription?: string | null;
  employmentType?: string | null;
  experienceLevel?: string | null;
  salaryRangeMin?: number | null;
  salaryRangeMax?: number | null;
  currency?: string;
  closingDate?: string | null;
}

class UpdateJobOpeningDto {
  positionId?: string | null;
  jobTitle?: string;
  departmentId?: string | null;
  jobDescription?: string | null;
  employmentType?: string | null;
  experienceLevel?: string | null;
  salaryRangeMin?: number | null;
  salaryRangeMax?: number | null;
  currency?: string;
  status?: string;
  closingDate?: string | null;
}

@UseGuards(RolesGuard)
@Controller('core/hr/job-openings')
export class JobOpeningController {
  constructor(private readonly service: JobOpeningService) { }

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Offre d\'emploi non trouvée');
    return item;
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateJobOpeningDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, {
      ...dto,
      status: dto.status as JobOpeningStatus | undefined,
      closingDate: dto.closingDate ? new Date(dto.closingDate) : undefined,
    });
  }

  @Post(':id/publish')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async publish(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.publish(tenant?.id as string, id);
  }

  @Post(':id/close')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async close(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.close(tenant?.id as string, id);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
