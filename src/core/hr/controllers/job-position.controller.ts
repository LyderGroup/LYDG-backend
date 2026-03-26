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
import { JobPositionService } from '../services/job-position.service';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';

class CreateJobPositionDto {
  departmentId?: string | null;
  title!: string;
  code!: string;
  description?: string | null;
  jobFamily?: string | null;
  jobLevel?: string | null;
  salaryGrade?: string | null;
  minSalary?: number | null;
  maxSalary?: number | null;
  isActive?: boolean;
}

class UpdateJobPositionDto {
  departmentId?: string | null;
  title?: string;
  code?: string;
  description?: string | null;
  jobFamily?: string | null;
  jobLevel?: string | null;
  salaryGrade?: string | null;
  minSalary?: number | null;
  maxSalary?: number | null;
  isActive?: boolean;
}

@UseGuards(RolesGuard)
@Controller('core/hr/job-positions')
export class JobPositionController {
  constructor(private readonly service: JobPositionService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const page = query.page ? parseInt(query.page as string, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit as string, 10) : undefined;
    const search = typeof query.search === 'string' ? query.search.trim() : undefined;
    const departmentId = typeof query.departmentId === 'string' ? query.departmentId : undefined;
    const isActive = query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;

    return this.service.findPage(tenant?.id as string, { page, limit, search, departmentId, isActive });
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Poste non trouvé');
    return item;
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async create(@Req() req: any, @Body() dto: CreateJobPositionDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    if (!dto.title?.trim()) throw new BadRequestException('Le titre est obligatoire');
    if (!dto.code?.trim()) throw new BadRequestException('Le code est obligatoire');

    return this.service.create(tenant?.id as string, {
      departmentId: dto.departmentId ?? null,
      title: dto.title.trim(),
      code: dto.code.trim(),
      description: dto.description ?? null,
      jobFamily: dto.jobFamily ?? null,
      jobLevel: dto.jobLevel ?? null,
      salaryGrade: dto.salaryGrade ?? null,
      minSalary: dto.minSalary ?? null,
      maxSalary: dto.maxSalary ?? null,
      isActive: dto.isActive ?? true,
    });
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateJobPositionDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
