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
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { DepartmentService } from '../services/department.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

class CreateDepartmentDto {
  @IsOptional() @IsString() parentDepartmentId?: string | null;
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() managerId?: string | null;
  @IsOptional() @IsString() location?: string | null;
  @IsOptional() @IsString() costCenter?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateDepartmentDto {
  @IsOptional() @IsString() parentDepartmentId?: string | null;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() managerId?: string | null;
  @IsOptional() @IsString() location?: string | null;
  @IsOptional() @IsString() costCenter?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/departments')
export class DepartmentController {
  constructor(private readonly service: DepartmentService) { }

  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_ORGANIZATIONS_READ, { moduleCode: 'module_c_rh' })
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const page = query.page ? parseInt(query.page as string, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit as string, 10) : undefined;
    const search = typeof query.search === 'string' ? query.search.trim() : undefined;
    const isActive = query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;

    return this.service.findPage(tenant?.id as string, { page, limit, search, isActive });
  }

  @Get(':id')
  @RequirePermission(HR_PERMISSIONS.HR_ORGANIZATIONS_READ, { moduleCode: 'module_c_rh' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Département non trouvé');
    return item;
  }

  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_ORGANIZATIONS_WRITE, { moduleCode: 'module_c_rh' })
  async create(@Req() req: any, @Body() dto: CreateDepartmentDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    if (!dto.name?.trim()) throw new BadRequestException('Le nom est obligatoire');
    if (!dto.code?.trim()) throw new BadRequestException('Le code est obligatoire');

    return this.service.create(tenant?.id as string, {
      parentDepartmentId: dto.parentDepartmentId ?? null,
      name: dto.name.trim(),
      code: dto.code.trim(),
      description: dto.description ?? null,
      managerId: dto.managerId ?? null,
      location: dto.location ?? null,
      costCenter: dto.costCenter ?? null,
      isActive: dto.isActive ?? true,
    });
  }

  @Patch(':id')
  @RequirePermission(HR_PERMISSIONS.HR_ORGANIZATIONS_WRITE, { moduleCode: 'module_c_rh' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, {
      parentDepartmentId: dto.parentDepartmentId,
      name: dto.name,
      code: dto.code,
      description: dto.description,
      managerId: dto.managerId,
      location: dto.location,
      costCenter: dto.costCenter,
      isActive: dto.isActive,
    });
  }

  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_ORGANIZATIONS_DELETE, { moduleCode: 'module_c_rh' })
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
