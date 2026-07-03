import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, IsBoolean, IsEnum, IsArray, IsUUID } from 'class-validator';
import { DepartmentsService } from './departments.service';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr/hr.permissions';
import { SYSTEM_PERMISSIONS } from '../global/global.permissions';

class CreateDepartmentDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsUUID()
  @IsOptional()
  parentDepartmentId?: string | null;
}

class UpdateDepartmentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsUUID()
  @IsOptional()
  parentDepartmentId?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

class BulkDepartmentActionDto {
  @IsEnum(['soft-delete', 'restore', 'activate', 'deactivate'])
  action!: 'soft-delete' | 'restore' | 'activate' | 'deactivate';

  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

@UseGuards(PermissionGuard)
@Controller('core/departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) { }

  @Get()
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const query = req.query ?? {};

    const page = query.page ? parseInt(query.page as string, 10) : undefined;
    const limit = query.limit
      ? parseInt(query.limit as string, 10)
      : undefined;
    const search =
      typeof query.search === 'string' && query.search.trim().length > 0
        ? query.search.trim()
        : undefined;
    const includeInactive =
      query.includeInactive === 'true' || query.includeInactive === true;

    return this.departmentsService.findPageForTenant(tenant?.id as string, {
      page,
      limit,
      search,
      includeInactive,
    });
  }

  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_ORGANIZATIONS_WRITE_OWN)
  async create(@Req() req: any, @Body() dto: CreateDepartmentDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Le nom du département est obligatoire');
    }
    if (!dto.code || !dto.code.trim()) {
      throw new BadRequestException('Le code du département est obligatoire');
    }

    return this.departmentsService.createForTenant(
      tenant?.id as string,
      (currentUser?.id as string) ?? null,
      {
        name: dto.name,
        code: dto.code,
        description: dto.description ?? null,
        parentDepartmentId: dto.parentDepartmentId ?? null,
      },
    );
  }

  @Patch(':id')
  @RequirePermission(HR_PERMISSIONS.HR_ORGANIZATIONS_WRITE_OWN)
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    return this.departmentsService.updateForTenant(
      tenant?.id as string,
      id,
      (currentUser?.id as string) ?? null,
      {
        name: dto.name,
        code: dto.code,
        description: dto.description ?? null,
        parentDepartmentId: dto.parentDepartmentId ?? null,
        isActive: dto.isActive,
      },
    );
  }

  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_ORGANIZATIONS_WRITE_OWN)
  async softDelete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    await this.departmentsService.softDeleteForTenant(
      tenant?.id as string,
      id,
      (currentUser?.id as string) ?? null,
    );

    return { deleted: true };
  }

  @Post(':id/restore')
  @RequirePermission(HR_PERMISSIONS.HR_ORGANIZATIONS_WRITE_OWN)
  async restore(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    await this.departmentsService.restoreForTenant(
      tenant?.id as string,
      id,
      (currentUser?.id as string) ?? null,
    );

    return { restored: true };
  }

  @Delete(':id/hard')
  @RequirePermission(SYSTEM_PERMISSIONS.SYSTEM_ADMIN)
  async hardDelete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;

    await this.departmentsService.hardDeleteForTenant(
      tenant?.id as string,
      id,
    );

    return { hardDeleted: true };
  }

  @Post('bulk')
  @RequirePermission(HR_PERMISSIONS.HR_ORGANIZATIONS_WRITE_OWN)
  async bulk(@Req() req: any, @Body() dto: BulkDepartmentActionDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!dto.ids || !Array.isArray(dto.ids) || dto.ids.length === 0) {
      throw new BadRequestException('La liste d\'identifiants est obligatoire');
    }

    if (!dto.action) {
      throw new BadRequestException('L\'action à effectuer est obligatoire');
    }

    return this.departmentsService.bulkActionForTenant(
      tenant?.id as string,
      (currentUser?.id as string) ?? null,
      dto.action,
      dto.ids,
    );
  }
}
