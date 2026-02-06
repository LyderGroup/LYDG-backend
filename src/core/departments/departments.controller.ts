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
import { DepartmentsService } from './departments.service';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';

class CreateDepartmentDto {
  name!: string;
  code!: string;
  description?: string | null;
  parentDepartmentId?: string | null;
}

class UpdateDepartmentDto {
  name?: string;
  code?: string;
  description?: string | null;
  parentDepartmentId?: string | null;
  isActive?: boolean;
}

class BulkDepartmentActionDto {
  action!: 'soft-delete' | 'restore' | 'activate' | 'deactivate';
  ids!: string[];
}

@UseGuards(RolesGuard)
@Controller('core/departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
  @Roles('SUPER_ADMIN')
  async hardDelete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;

    await this.departmentsService.hardDeleteForTenant(
      tenant?.id as string,
      id,
    );

    return { hardDeleted: true };
  }

  @Post('bulk')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
