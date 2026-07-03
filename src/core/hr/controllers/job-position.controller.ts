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
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { JobPositionService } from '../services/job-position.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

class CreateJobPositionDto {
  @IsOptional() @IsString() departmentId?: string | null;
  @IsString() title!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() jobFamily?: string | null;
  @IsOptional() @IsString() jobLevel?: string | null;
  @IsOptional() @IsString() salaryGrade?: string | null;
  @IsOptional() @IsNumber() minSalary?: number | null;
  @IsOptional() @IsNumber() maxSalary?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateJobPositionDto {
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() jobFamily?: string | null;
  @IsOptional() @IsString() jobLevel?: string | null;
  @IsOptional() @IsString() salaryGrade?: string | null;
  @IsOptional() @IsNumber() minSalary?: number | null;
  @IsOptional() @IsNumber() maxSalary?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/job-positions')
export class JobPositionController {
  constructor(private readonly service: JobPositionService) { }

  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, { moduleCode: 'module_c_rh' })
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
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, { moduleCode: 'module_c_rh' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Poste non trouvé');
    return item;
  }

  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
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
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateJobPositionDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, dto);
  }

  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
