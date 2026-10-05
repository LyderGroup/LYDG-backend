import {
  BadRequestException,
  Body,
  ConflictException,
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
import { IsNull, In, Like, Repository } from 'typeorm';
import { IsString, IsOptional, IsBoolean, IsNumber, IsEnum, IsArray, IsUUID } from 'class-validator';
import { Role } from './role.entity';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';
import { GLOBAL_PERMISSIONS } from '../global/global.permissions';

/** core.roles.code est un VARCHAR(50). */
const ROLE_CODE_MAX_LENGTH = 50;

class CreateRoleDto {
  @IsUUID()
  @IsOptional()
  organizationId?: string | null;

  @IsString()
  name!: string;

  /**
   * Optionnel : dérivé du nom quand il n'est pas fourni. Le front ne l'expose
   * plus, mais les seeds et scripts d'init continuent d'imposer leurs codes.
   */
  @IsString()
  @IsOptional()
  code?: string;

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

  /** Normalise un libellé en code technique : « Chef de Projet » → CHEF_DE_PROJET. */
  private toRoleCode(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // retire les diacritiques
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, ROLE_CODE_MAX_LENGTH);
  }

  /**
   * Résout un code libre pour l'organisation. La contrainte est
   * UNIQUE(organization_id, code) et elle ignore `is_active` : un profil
   * désactivé occupe toujours son code, d'où l'absence de filtre ici.
   */
  private async resolveUniqueRoleCode(
    base: string,
    orgId: string | null,
  ): Promise<string> {
    const root = base || 'ROLE';

    // Un seul aller-retour : LIKE 'ROOT%' ramène tous les codes candidats.
    // (`_` est un joker LIKE, donc la requête sur-sélectionne au pire — les
    // comparaisons ci-dessous restent des égalités exactes.)
    const existing = await this.rolesRepo.find({
      where: {
        organizationId: orgId === null ? IsNull() : orgId,
        code: Like(`${root}%`),
      },
      select: ['code'],
    });
    const taken = new Set(existing.map((role) => role.code));

    for (let attempt = 1; attempt <= 999; attempt++) {
      const suffix = attempt === 1 ? '' : `_${attempt}`;
      const candidate = `${root.slice(0, ROLE_CODE_MAX_LENGTH - suffix.length)}${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }

    throw new ConflictException(
      'Impossible de générer un code unique pour ce profil',
    );
  }

  @Post()
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_CREATE)
  async create(@Req() req: any, @Body() dto: CreateRoleDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = dto.organizationId ?? tenant?.id ?? null;

    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Le nom du rôle est obligatoire');
    }

    // Le code n'est plus saisi par l'utilisateur : il est dérivé du nom, puis
    // suffixé (_2, _3…) tant qu'il est pris dans l'organisation.
    const code = await this.resolveUniqueRoleCode(
      this.toRoleCode(dto.code?.trim() || dto.name),
      orgId,
    );

    const role = this.rolesRepo.create({
      organizationId: orgId,
      name: dto.name,
      code,
      description: dto.description ?? null,
      roleLevel: dto.roleLevel ?? 1,
      isDefault: dto.isDefault ?? false,
    });

    try {
      return await this.rolesRepo.save(role);
    } catch (err: any) {
      // Filet de sécurité : deux créations concurrentes peuvent viser le même
      // code entre la lecture et l'insertion.
      if (err?.code === '23505') {
        throw new ConflictException('Un profil portant ce code existe déjà');
      }
      throw err;
    }
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
