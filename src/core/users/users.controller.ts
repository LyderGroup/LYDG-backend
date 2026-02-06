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
import { UsersService } from './users.service';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';

class CreateUserDto {
  firstName!: string;
  lastName!: string;
  email!: string;
  phone!: string;
  department!: string;
  roleId!: string;
}

class UpdateUserDto {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  language?: string | null;
  timezone?: string | null;
  department?: string | null;
  isActive?: boolean;
}

class BulkUserActionDto {
  action!: 'soft-delete' | 'restore' | 'activate' | 'deactivate';
  ids!: string[];
}

class ChangeUserRoleDto {
  roleId!: string;
}

@UseGuards(RolesGuard)
@Controller('core/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const query = req.query ?? {};

    const page = query.page ? parseInt(query.page as string, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit as string, 10) : undefined;
    const search =
      typeof query.search === 'string' && query.search.trim().length > 0
        ? query.search.trim()
        : undefined;
    const includeInactive =
      query.includeInactive === 'true' || query.includeInactive === true;
    const roleId =
      typeof query.roleId === 'string' && query.roleId.trim().length > 0
        ? query.roleId.trim()
        : undefined;

    return this.usersService.findPageForTenant(tenant?.id as string, {
      page,
      limit,
      search,
      includeInactive,
      roleId,
    });
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async create(@Req() req: any, @Body() dto: CreateUserDto) {
    const tenant = req.tenant;
    const currentUser = req.user;

    if (!dto.firstName || !dto.firstName.trim()) {
      throw new BadRequestException('Le prénom est obligatoire');
    }
    if (!dto.lastName || !dto.lastName.trim()) {
      throw new BadRequestException('Le nom est obligatoire');
    }
    if (!dto.email || !dto.email.trim()) {
      throw new BadRequestException("L'email est obligatoire");
    }
    if (!dto.phone || !dto.phone.trim()) {
      throw new BadRequestException('Le téléphone est obligatoire');
    }
    if (!dto.department || !dto.department.trim()) {
      throw new BadRequestException('Le département est obligatoire');
    }
    if (!dto.roleId || !dto.roleId.trim()) {
      throw new BadRequestException('Le rôle est obligatoire');
    }

    return this.usersService.createForTenant(
      tenant.id,
      currentUser?.id ?? null,
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        department: dto.department,
        roleId: dto.roleId,
      },
    );
  }

  @Get(':id/role')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async getUserRole(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.usersService.getActiveRoleForUser(tenant?.id as string, id);
  }

  @Patch(':id/role')
  @Roles('SUPER_ADMIN')
  async changeUserRole(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ChangeUserRoleDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!dto.roleId || !dto.roleId.trim()) {
      throw new BadRequestException('Le rôle est obligatoire');
    }

    if (currentUser?.id && currentUser.id === id) {
      throw new BadRequestException('Vous ne pouvez pas modifier votre propre rôle');
    }

    return this.usersService.changeRoleForUser(
      tenant?.id as string,
      (currentUser?.id as string) ?? null,
      id,
      dto.roleId,
    );
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    return this.usersService.updateForTenant(
      tenant?.id as string,
      id,
      (currentUser?.id as string) ?? null,
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? undefined,
        language: dto.language ?? undefined,
        timezone: dto.timezone ?? undefined,
        department: dto.department ?? undefined,
        isActive: dto.isActive,
      },
    );
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async softDelete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    await this.usersService.softDeleteForTenant(
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

    await this.usersService.restoreForTenant(
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

    await this.usersService.hardDeleteForTenant(tenant?.id as string, id);

    return { hardDeleted: true };
  }

  @Post('bulk')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async bulk(@Req() req: any, @Body() dto: BulkUserActionDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!dto.ids || !Array.isArray(dto.ids) || dto.ids.length === 0) {
      throw new BadRequestException('La liste d\'identifiants est obligatoire');
    }

    if (!dto.action) {
      throw new BadRequestException('L\'action à effectuer est obligatoire');
    }

    return this.usersService.bulkActionForTenant(
      tenant?.id as string,
      (currentUser?.id as string) ?? null,
      dto.action,
      dto.ids,
    );
  }
}
