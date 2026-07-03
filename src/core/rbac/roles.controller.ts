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
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, In, Repository } from 'typeorm';
import { IsString, IsOptional, IsBoolean, IsNumber, IsEnum, IsArray, IsUUID } from 'class-validator';
import { Role } from './role.entity';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';
import { GLOBAL_PERMISSIONS } from '../global/global.permissions';

class CreateRoleDto {
  @IsUUID()
  @IsOptional()
  organizationId?: string | null;

  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsNumber()
  @IsOptional()
  roleLevel?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

class UpdateRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsNumber()
  @IsOptional()
  roleLevel?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

class BulkRoleActionDto {
  @IsEnum(['soft-delete', 'restore', 'activate', 'deactivate'])
  action!: 'soft-delete' | 'restore' | 'activate' | 'deactivate';

  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}
@UseGuards(PermissionGuard)
@Controller('core/rbac/roles')
export class RolesController {
  constructor(
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
  ) { }

  @Get()
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_READ_ALL)
  async findAll(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    const query = req.query ?? {};

    const page = query.page ? parseInt(query.page as string, 10) : 1;
    const limitRaw = query.limit ? parseInt(query.limit as string, 10) : 20;
    const limit = limitRaw > 0 && limitRaw <= 100 ? limitRaw : 20;

    const search =
      typeof query.search === 'string' && query.search.trim().length > 0
        ? query.search.trim()
        : undefined;
    const includeInactive =
      query.includeInactive === 'true' || query.includeInactive === true;

    // Utiliser find() avec relations pour éviter l'erreur QueryBuilder avec ORDER BY
    const findOptions: any = {
      relations: ['rolePermissions', 'rolePermissions.permission'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    };

    const whereConditions: any = {};

    if (orgId) {
      whereConditions.organizationId = orgId;
    }

    if (!includeInactive) {
      whereConditions.isActive = true;
    }

    // Pour la recherche, on doit utiliser QueryBuilder
    if (search) {
      const qb = this.rolesRepo.createQueryBuilder('r')
        .leftJoinAndSelect('r.rolePermissions', 'rp')
        .leftJoinAndSelect('rp.permission', 'p');

      if (orgId) {
        qb.where('r.organizationId = :orgId', { orgId });
      } else {
        qb.where('1 = 1');
      }

      if (!includeInactive) {
        qb.andWhere('r.isActive = :isActive', { isActive: true });
      }

      const term = `%${search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(r.name) LIKE :term OR LOWER(r.code) LIKE :term)',
        { term },
      );

      // Utiliser un alias différent pour éviter le conflit avec ORDER BY
      const [items, total] = await qb
        .orderBy('r.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return {
        data: items,
        meta: {
          total,
          page,
          limit,
          pageCount: Math.ceil(total / limit) || 1,
        },
      };
    }

    findOptions.where = Object.keys(whereConditions).length > 0 ? whereConditions : undefined;

    const [items, total] = await this.rolesRepo.findAndCount(findOptions);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit) || 1,
      },
    };
  }

  @Get(':id')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_READ)
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;

    if (orgId) {
      return this.rolesRepo.findOne({
        where: { id, organizationId: orgId },
      });
    }

    return this.rolesRepo.findOne({ where: { id } });
  }

  @Post()
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_CREATE)
  async create(@Req() req: any, @Body() dto: CreateRoleDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = dto.organizationId ?? tenant?.id ?? null;

    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Le nom du rôle est obligatoire');
    }
    if (!dto.code || !dto.code.trim()) {
      throw new BadRequestException('Le code du rôle est obligatoire');
    }

    const role = this.rolesRepo.create({
      organizationId: orgId,
      name: dto.name,
      code: dto.code,
      description: dto.description ?? null,
      roleLevel: dto.roleLevel ?? 1,
      isDefault: dto.isDefault ?? false,
    });
    return this.rolesRepo.save(role);
  }

  @Patch(':id')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_EDIT)
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;

    const patch: Partial<Role> = {};
    if (typeof dto.name === 'string') patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (typeof dto.roleLevel === 'number') patch.roleLevel = dto.roleLevel;
    if (typeof dto.isDefault === 'boolean') patch.isDefault = dto.isDefault;
    if (typeof dto.isActive === 'boolean') patch.isActive = dto.isActive;

    const where: any = { id };
    if (orgId) {
      where.organizationId = orgId;
    }

    await this.rolesRepo.update(where, patch as any);

    return this.findOne(req, id);
  }

  @Delete(':id')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_DELETE)
  async softDelete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;

    const where: any = { id };
    if (orgId) {
      where.organizationId = orgId;
    }

    await this.rolesRepo.update(where, { isActive: false } as any);
    return { deleted: true };
  }

  @Post(':id/restore')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_EDIT)
  async restore(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;

    const where: any = { id };
    if (orgId) {
      where.organizationId = orgId;
    }

    await this.rolesRepo.update(where, { isActive: true } as any);
    return { restored: true };
  }

  @Delete(':id/hard')
  @RequirePermission(GLOBAL_PERMISSIONS.SYSTEM_ADMIN)
  async hardDelete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;

    const where: any = { id };
    if (orgId) {
      where.organizationId = orgId;
    }

    await this.rolesRepo.delete(where);
    return { hardDeleted: true };
  }

  @Post('bulk')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_EDIT)
  async bulk(@Req() req: any, @Body() dto: BulkRoleActionDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;

    if (!dto.ids || !Array.isArray(dto.ids) || dto.ids.length === 0) {
      throw new BadRequestException('La liste d\'identifiants est obligatoire');
    }

    if (!dto.action) {
      throw new BadRequestException('L\'action à effectuer est obligatoire');
    }

    const where: any = { id: In(dto.ids) };
    if (orgId) {
      where.organizationId = orgId;
    }

    let patch: Partial<Role>;
    switch (dto.action) {
      case 'soft-delete':
        patch = { isActive: false };
        break;
      case 'restore':
      case 'activate':
        patch = { isActive: true };
        break;
      case 'deactivate':
        patch = { isActive: false };
        break;
      default:
        throw new BadRequestException('Action de masse non prise en charge');
    }

    const result = await this.rolesRepo.update(where, patch as any);
    return { affected: result.affected ?? 0 };
  }
}
