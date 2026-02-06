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
import { Role } from './role.entity';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';

class CreateRoleDto {
  organizationId?: string | null;
  name!: string;
  code!: string;
  description?: string | null;
  roleLevel?: number;
  isSystemRole?: boolean;
  isDefault?: boolean;
}

class UpdateRoleDto {
  name?: string;
  description?: string | null;
  roleLevel?: number;
  isSystemRole?: boolean;
  isDefault?: boolean;
  isActive?: boolean;
}

class BulkRoleActionDto {
  action!: 'soft-delete' | 'restore' | 'activate' | 'deactivate';
  ids!: string[];
}
@UseGuards(RolesGuard)
@Controller('core/rbac/roles')
export class RolesController {
  constructor(
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
  ) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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

    const qb = this.rolesRepo.createQueryBuilder('r');

    if (orgId) {
      qb.where(
        '(r.organization_id = :orgId OR (r.organization_id IS NULL AND r.is_system_role = true))',
        { orgId },
      );
    } else {
      qb.where('1 = 1');
    }

    if (!includeInactive) {
      qb.andWhere('r.is_active = true');
    }

    if (search) {
      const term = `%${search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(r.name) LIKE :term OR LOWER(r.code) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('r.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;

    if (orgId) {
      return this.rolesRepo.findOne({
        where: [
          { id, organizationId: orgId },
          { id, organizationId: IsNull(), isSystemRole: true },
        ],
      });
    }

    return this.rolesRepo.findOne({ where: { id } });
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  async create(@Req() req: any, @Body() dto: CreateRoleDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = dto.organizationId ?? tenant?.id ?? null;

    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Le nom du rôle est obligatoire');
    }
    if (!dto.code || !dto.code.trim()) {
      throw new BadRequestException('Le code du rôle est obligatoire');
    }

    const isSystemRole = orgId ? false : dto.isSystemRole ?? false;

    const role = this.rolesRepo.create({
      organizationId: orgId,
      name: dto.name,
      code: dto.code,
      description: dto.description ?? null,
      roleLevel: dto.roleLevel ?? 1,
      isSystemRole,
      isDefault: dto.isDefault ?? false,
    });
    return this.rolesRepo.save(role);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
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
    if (typeof dto.isSystemRole === 'boolean') patch.isSystemRole = dto.isSystemRole;
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
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
  @Roles('SUPER_ADMIN')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
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
