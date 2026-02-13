import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoreModule } from '../modules/module.entity';
import { OrganizationModule } from '../modules/organization-module.entity';
import { Permission } from './permission.entity';
import { Role } from './role.entity';
import { RolePermission } from './role-permission.entity';
import { RbacService } from './rbac.service';
import { UserRole } from './user-role.entity';
import {
  REQUIRED_PERMISSION_KEY,
  REQUIRED_PERMISSION_MODULE_KEY,
} from './require-permission.decorator';

type CachedPermissions = {
  expiresAt: number;
  permissions: Set<string>;
};

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly cache = new Map<string, CachedPermissions>();
  private readonly ttlMs = 30_000;

  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionsRepo: Repository<RolePermission>,
    @InjectRepository(Permission)
    private readonly permissionsRepo: Repository<Permission>,
    @InjectRepository(CoreModule)
    private readonly modulesRepo: Repository<CoreModule>,
    @InjectRepository(OrganizationModule)
    private readonly orgModulesRepo: Repository<OrganizationModule>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const requiredModuleCode = this.reflector.getAllAndOverride<string>(
      REQUIRED_PERMISSION_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest() as any;

    const user = request.user;
    const headerUserId = request.headers['x-user-id'] ?? request.headers['X-User-Id'];

    let userId: string | undefined;

    if (user && user.id) {
      userId = String(user.id);
    } else if (typeof headerUserId === 'string') {
      userId = headerUserId;
    } else if (Array.isArray(headerUserId) && headerUserId.length > 0) {
      userId = String(headerUserId[0]);
    }

    if (!userId) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const tenant = request.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ? String(tenant.id) : undefined;

    if (!organizationId) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }

    const hasSystemRole = await this.rbacService.userHasAnySystemRole(
      userId,
      organizationId,
    );
    if (hasSystemRole) {
      request.permissionCodes = ['projects.task.read.global'];
      return true;
    }

    const moduleCode =
      requiredModuleCode ??
      this.inferModuleCodeFromPermission(requiredPermissions[0] ?? '');

    if (moduleCode) {
      const enabled = await this.isModuleEnabledForOrganization(moduleCode, organizationId);
      if (!enabled) {
        throw new ForbiddenException(`Module ${moduleCode} is not enabled for this organization`);
      }
    }

    const permissions = await this.getCachedPermissionsForUser(userId, organizationId);

    request.permissionCodes = Array.from(permissions);

    const ok = requiredPermissions.some((p) => permissions.has(p));
    if (!ok) {
      throw new ForbiddenException('Missing required permission');
    }

    return true;
  }

  private inferModuleCodeFromPermission(permissionCode: string): string | null {
    if (permissionCode.startsWith('projects.')) {
      return 'module_b_projects';
    }
    return null;
  }

  private async isModuleEnabledForOrganization(
    moduleCode: string,
    organizationId: string,
  ): Promise<boolean> {
    const mod = await this.modulesRepo.findOne({ where: { code: moduleCode } });
    if (!mod) {
      throw new BadRequestException(`Unknown module code: ${moduleCode}`);
    }

    if (mod.isCoreModule) {
      return true;
    }

    const orgModule = await this.orgModulesRepo.findOne({
      where: { organizationId, moduleId: mod.id, isEnabled: true },
    });

    return !!orgModule;
  }

  private async getCachedPermissionsForUser(
    userId: string,
    organizationId: string,
  ): Promise<Set<string>> {
    const cacheKey = `${userId}:${organizationId}`;
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.permissions;
    }

    const qb = this.userRolesRepo
      .createQueryBuilder('ur')
      .innerJoin(Role, 'r', 'r.id = ur.role_id')
      .innerJoin(RolePermission, 'rp', 'rp.role_id = r.id')
      .innerJoin(Permission, 'p', 'p.id = rp.permission_id')
      .where('ur.user_id = :userId', { userId })
      .andWhere('ur.is_active = true')
      .andWhere('(ur.expires_at IS NULL OR ur.expires_at > NOW())')
      .andWhere('r.is_active = true')
      .andWhere('(r.organization_id = :orgId OR r.is_system_role = true)', {
        orgId: organizationId,
      })
      .andWhere('p.code IS NOT NULL');

    const rows = await qb.select(['p.code AS code']).getRawMany<{ code: string }>();

    const set = new Set(
      rows
        .map((r) => r.code)
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0),
    );

    this.cache.set(cacheKey, { expiresAt: now + this.ttlMs, permissions: set });

    return set;
  }
}
