import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsEmail, IsOptional, IsBoolean, IsEnum, IsArray } from 'class-validator';
import { UsersService } from './users.service';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { GLOBAL_PERMISSIONS } from '../global/global.permissions';

class CreateUserDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsOptional()
  phone!: string;

  @IsString()
  department!: string;

  @IsString()
  roleId!: string;
}

class UpdateUserDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phone?: string | null;

  @IsString()
  @IsOptional()
  gender?: string | null;

  @IsString()
  @IsOptional()
  birthDate?: string | null;

  @IsString()
  @IsOptional()
  language?: string | null;

  @IsString()
  @IsOptional()
  timezone?: string | null;

  @IsString()
  @IsOptional()
  department?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

class BulkUserActionDto {
  @IsEnum(['soft-delete', 'restore', 'activate', 'deactivate'])
  action!: 'soft-delete' | 'restore' | 'activate' | 'deactivate';

  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

class ChangeUserRoleDto {
  @IsString()
  roleId!: string;
}

@UseGuards(PermissionGuard)
@Controller('core/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get()
  @RequirePermission(GLOBAL_PERMISSIONS.USER_READ_ALL)
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
  @RequirePermission(GLOBAL_PERMISSIONS.USER_MANAGE)
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
  @RequirePermission(GLOBAL_PERMISSIONS.USER_READ_ALL)
  async getUserRole(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.usersService.getActiveRoleForUser(tenant?.id as string, id);
  }

  @Patch(':id/role')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_ASSIGN)
  async changeUserRole(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
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
  @RequirePermission(GLOBAL_PERMISSIONS.USER_MANAGE)
  async update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
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
        gender: dto.gender ?? undefined,
        birthDate: dto.birthDate ?? undefined,
        language: dto.language ?? undefined,
        timezone: dto.timezone ?? undefined,
        department: dto.department ?? undefined,
        isActive: dto.isActive,
      },
    );
  }

  // Profil de l'utilisateur courant (user + rôle actif + employé). Pas de
  // permission requise au-delà de l'authentification : un user accède toujours
  // à ses propres infos.
  @Get('me/profile')
  async getOwnProfile(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!currentUser?.id) {
      throw new BadRequestException('Utilisateur non authentifié');
    }
    if (!tenant?.id) {
      throw new BadRequestException('Contexte organisation manquant');
    }

    const profile = await this.usersService.findOwnProfile(tenant.id, currentUser.id);
    if (!profile) {
      throw new BadRequestException('Profil introuvable');
    }
    return profile;
  }

  // Endpoint pour que l'utilisateur modifie son propre profil (sans restriction de rôle)
  @Patch('me/profile')
  async updateOwnProfile(
    @Req() req: any,
    @Body() dto: UpdateUserDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!currentUser?.id) {
      throw new BadRequestException('Utilisateur non authentifié');
    }

    return this.usersService.updateForTenant(
      tenant?.id as string,
      currentUser.id,
      (currentUser?.id as string) ?? null,
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? undefined,
        gender: dto.gender ?? undefined,
        birthDate: dto.birthDate ?? undefined,
        language: dto.language ?? undefined,
        timezone: dto.timezone ?? undefined,
      },
    );
  }

  @Delete(':id')
  @RequirePermission(GLOBAL_PERMISSIONS.USER_DELETE)
  async softDelete(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
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
  @RequirePermission(GLOBAL_PERMISSIONS.USER_MANAGE)
  async restore(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
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
  @RequirePermission(GLOBAL_PERMISSIONS.SYSTEM_ADMIN)
  async hardDelete(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;

    await this.usersService.hardDeleteForTenant(tenant?.id as string, id);

    return { hardDeleted: true };
  }

  @Post('bulk')
  @RequirePermission(GLOBAL_PERMISSIONS.USER_MANAGE)
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

  @Get(':id/login-history')
  @RequirePermission(GLOBAL_PERMISSIONS.USER_READ_ALL)
  async getLoginHistory(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const query = req.query ?? {};
    const limit = query.limit ? parseInt(query.limit as string, 10) : 20;

    return this.usersService.getLoginHistoryForUser(
      tenant?.id as string,
      id,
      Math.min(limit, 100),
    );
  }
}
