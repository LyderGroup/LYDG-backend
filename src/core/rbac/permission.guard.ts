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
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
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
    private readonly eventEmitter: EventEmitter2,
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
  ) { }

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
    // SÉCURITÉ : la seule source de vérité pour l'identité est request.user,
    // posée par FirebaseAuthGuard après vérification du token Firebase.
    // Le fallback sur des en-têtes (x-user-id) a été retiré car il permettait
    // l'usurpation d'identité si les guards étaient mal ordonnés.
    if (!user || !user.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    const userId: string = String(user.id);

    const tenant = request.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ? String(tenant.id) : undefined;

    if (!organizationId) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
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

    const basePermissions = await this.getCachedPermissionsForUser(userId, organizationId);
    const permissions = new Set(basePermissions);

    if (permissions.size === 0) {
      throw new ForbiddenException('User has no permissions assigned');
    }

    await this.maybeAugmentPermissionsFromProjectMembership({
      moduleCode,
      userId,
      organizationId,
      permissions,
      request,
    });

    request.permissionCodes = Array.from(permissions);

    const ok = requiredPermissions.some((p) => permissions.has(p));
    if (!ok) {
      throw new ForbiddenException('Missing required permission');
    }

    return true;
  }

  private async maybeAugmentPermissionsFromProjectMembership(input: {
    moduleCode: string | null;
    userId: string;
    organizationId: string;
    permissions: Set<string>;
    request: any;
  }): Promise<void> {
    if (input.moduleCode !== 'module_b_projects') {
      return;
    }

    if (input.permissions.has('projects.task.read.project')) {
      return;
    }

    try {
      const params = (input.request?.params ?? {}) as Record<string, any>;

      const projectId =
        typeof params.projectId === 'string' && params.projectId.trim()
          ? params.projectId.trim()
          : typeof params.id === 'string' && params.id.trim() && String(input.request?.route?.path ?? '').includes('projects')
            ? params.id.trim()
            : undefined;

      const taskId =
        typeof params.id === 'string' && params.id.trim()
          ? params.id.trim()
          : typeof params.taskId === 'string' && params.taskId.trim()
            ? params.taskId.trim()
            : undefined;

      const subtaskId =
        typeof params.subtaskId === 'string' && params.subtaskId.trim() ? params.subtaskId.trim() : undefined;

      if (taskId || subtaskId) {
        const rows = (await this.userRolesRepo.manager.query(
          taskId
            ? `
              SELECT
                t.project_id AS project_id,
                CASE
                  WHEN p.created_by = $1 OR COALESCE(pm.role_in_project, 'MEMBER') = 'MANAGER' OR p.manager_id = $1 THEN 1
                  ELSE 0
                END AS is_manager,
                CASE WHEN pm.id IS NULL AND p.manager_id <> $1 AND p.created_by <> $1 THEN 0 ELSE 1 END AS is_member
              FROM module_b_projects.tasks t
              INNER JOIN module_b_projects.projects p ON p.id = t.project_id
              LEFT JOIN module_b_projects.project_members pm
                ON pm.project_id = t.project_id
               AND pm.user_id = $1
              WHERE t.id = $2
                AND p.organization_id = $3
              LIMIT 1
              `
            : `
              SELECT
                t.project_id AS project_id,
                CASE
                  WHEN p.created_by = $1 OR COALESCE(pm.role_in_project, 'MEMBER') = 'MANAGER' OR p.manager_id = $1 THEN 1
                  ELSE 0
                END AS is_manager,
                CASE WHEN pm.id IS NULL AND p.manager_id <> $1 AND p.created_by <> $1 THEN 0 ELSE 1 END AS is_member
              FROM module_b_projects.subtasks s
              INNER JOIN module_b_projects.tasks t ON t.id = s.task_id
              INNER JOIN module_b_projects.projects p ON p.id = t.project_id
              LEFT JOIN module_b_projects.project_members pm
                ON pm.project_id = t.project_id
               AND pm.user_id = $1
              WHERE s.id = $2
                AND p.organization_id = $3
              LIMIT 1
              `,
          [input.userId, taskId ?? subtaskId, input.organizationId],
        )) as Array<{ project_id?: string; is_manager?: number; is_member?: number }>;

        if (!rows[0]?.project_id || !rows[0]?.is_member) {
          return;
        }

        input.permissions.add('projects.task.read.project');
        if (rows[0]?.is_manager) {
          input.permissions.add('projects.task.write.project');
          input.permissions.add('projects.task.delete.project');
          input.permissions.add('projects.task.validate.project');
        }

        return;
      }

      if (projectId) {
        const rows = (await this.userRolesRepo.manager.query(
          `
          SELECT
            p.id AS project_id,
            CASE
              WHEN p.created_by = $1 OR p.manager_id = $1 OR COALESCE(pm.role_in_project, 'MEMBER') = 'MANAGER' THEN 1
              ELSE 0
            END AS is_manager,
            CASE
              WHEN p.created_by = $1 OR p.manager_id = $1 OR pm.id IS NOT NULL THEN 1
              ELSE 0
            END AS is_member
          FROM module_b_projects.projects p
          LEFT JOIN module_b_projects.project_members pm
            ON pm.project_id = p.id
           AND pm.user_id = $1
          WHERE p.id = $2
            AND p.organization_id = $3
          LIMIT 1
          `,
          [input.userId, projectId, input.organizationId],
        )) as Array<{ project_id?: string; is_manager?: number; is_member?: number }>;

        if (!rows[0]?.project_id || !rows[0]?.is_member) {
          return;
        }

        input.permissions.add('projects.task.read.project');
        if (rows[0]?.is_manager) {
          input.permissions.add('projects.task.write.project');
          input.permissions.add('projects.task.delete.project');
          input.permissions.add('projects.task.validate.project');
        }

        return;
      }

      const fallback = (await this.userRolesRepo.manager.query(
        `
        SELECT 1 AS ok
        FROM module_b_projects.project_members pm
        INNER JOIN module_b_projects.projects p ON p.id = pm.project_id
        WHERE pm.user_id = $1
          AND p.organization_id = $2
        LIMIT 1
        `,
        [input.userId, input.organizationId],
      )) as Array<{ ok?: number }>;

      if (fallback[0]?.ok) {
        input.permissions.add('projects.task.read.project');
      }
    } catch {
      return;
    }
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
      // Si le module n'est pas enregistré, on autorise par défaut
      // (pour les modules en développement ou non enregistrés)
      return true;
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
      .andWhere('(r.organization_id = :orgId OR r.organization_id IS NULL)', { orgId: organizationId })
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

  /**
   * Invalide le cache des permissions pour un utilisateur spécifique
   * À appeler après tout changement de rôle ou de permission
   */
  invalidateCache(userId: string, organizationId: string): void {
    const cacheKey = `${userId}:${organizationId}`;
    this.cache.delete(cacheKey);
  }

  /**
   * Invalide tout le cache des permissions
   * À utiliser avec parcimonie (ex: après un bulk update)
   */
  invalidateAllCache(): void {
    this.cache.clear();
  }

  /**
   * Event handler: invalide le cache pour un utilisateur spécifique
   */
  @OnEvent('rbac.permissions.changed')
  handlePermissionsChanged(payload: { userId: string; organizationId: string }) {
    this.invalidateCache(payload.userId, payload.organizationId);
  }

  /**
   * Event handler: invalide tout le cache (ex: changement de rôle)
   */
  @OnEvent('rbac.role.changed')
  handleRoleChanged(payload: { roleId: string }) {
    // Invalider tout le cache car on ne sait pas quels utilisateurs sont affectés
    this.invalidateAllCache();
  }
}
