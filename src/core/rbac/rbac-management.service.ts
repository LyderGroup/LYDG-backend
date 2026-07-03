import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsString, IsOptional, IsBoolean, IsNumber, IsArray, IsUUID, IsDateString } from 'class-validator';
import { Role } from './role.entity';
import { Permission } from './permission.entity';
import { RolePermission } from './role-permission.entity';
import { UserRole } from './user-role.entity';


export class CreateRoleDto {
  @IsString()
  name: string = '';

  @IsString()
  code: string = '';

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  parentRoleId?: string;

  @IsNumber()
  @IsOptional()
  roleLevel?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  permissionIds?: string[];
}

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  parentRoleId?: string | null;

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

export class CreatePermissionDto {
  @IsString()
  code: string = '';

  @IsString()
  resource: string = '';

  @IsString()
  action: string = '';

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  systemModuleCode?: string;

  @IsBoolean()
  @IsOptional()
  isCrudAction?: boolean;
}

export class UpdatePermissionDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class AssignPermissionsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds: string[] = [];
}

export class AssignRoleToUserDto {
  @IsUUID()
  roleId: string = '';

  @IsUUID()
  userId: string = '';

  @IsDateString()
  @IsOptional()
  expiresAt?: Date;
}


@Injectable()
export class RbacManagementService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionsRepo: Repository<Permission>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionsRepo: Repository<RolePermission>,
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
  ) { }

  async createRole(
    organizationId: string,
    dto: CreateRoleDto,
    createdBy: string,
  ): Promise<Role> {
    const existing = await this.rolesRepo.findOne({
      where: { code: dto.code, organizationId },
    });
    if (existing) {
      throw new BadRequestException(`Le rôle avec le code "${dto.code}" existe déjà`);
    }

    const role = this.rolesRepo.create({
      organizationId,
      name: dto.name,
      code: dto.code,
      description: dto.description ?? null,
      parentRoleId: dto.parentRoleId ?? null,
      roleLevel: dto.roleLevel ?? 1,
      isDefault: dto.isDefault ?? false,
      createdBy,
    });

    const savedRole = await this.rolesRepo.save(role);

    if (dto.permissionIds && dto.permissionIds.length > 0) {
      await this.assignPermissionsToRole(savedRole.id, dto.permissionIds, createdBy);
    }

    return this.getRoleWithPermissions(savedRole.id);
  }

  async updateRole(
    organizationId: string,
    roleId: string,
    dto: UpdateRoleDto,
  ): Promise<Role> {
    const role = await this.rolesRepo.findOne({
      where: { id: roleId, organizationId },
    });

    if (!role) {
      throw new NotFoundException('Rôle non trouvé');
    }


    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.parentRoleId !== undefined) role.parentRoleId = dto.parentRoleId;
    if (dto.roleLevel !== undefined) role.roleLevel = dto.roleLevel;
    if (dto.isDefault !== undefined) role.isDefault = dto.isDefault;
    if (dto.isActive !== undefined) role.isActive = dto.isActive;

    return this.rolesRepo.save(role);
  }

  async deleteRole(organizationId: string, roleId: string): Promise<void> {
    const role = await this.rolesRepo.findOne({
      where: { id: roleId, organizationId },
    });

    if (!role) {
      throw new NotFoundException('Rôle non trouvé');
    }

    // Plus de protection par rôle système - tous les rôles sont supprimables

    // Supprimer les assignations de permissions
    await this.rolePermissionsRepo.delete({ roleId });

    // Supprimer les assignations aux utilisateurs
    await this.userRolesRepo.delete({ roleId });

    // Supprimer le rôle
    await this.rolesRepo.delete(roleId);
  }

  async listRoles(organizationId: string): Promise<Role[]> {
    return this.rolesRepo.find({
      where: { organizationId },
      relations: ['parentRole', 'rolePermissions', 'rolePermissions.permission'],
      order: { roleLevel: 'DESC', name: 'ASC' },
    });
  }

  async getRoleWithPermissions(roleId: string): Promise<Role> {
    const role = await this.rolesRepo.findOne({
      where: { id: roleId },
      relations: ['parentRole', 'rolePermissions', 'rolePermissions.permission'],
    });

    if (!role) {
      throw new NotFoundException('Rôle non trouvé');
    }

    return role;
  }

  async createPermission(dto: CreatePermissionDto): Promise<Permission> {
    // Vérifier si le code existe déjà
    const existing = await this.permissionsRepo.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(`La permission avec le code "${dto.code}" existe déjà`);
    }

    const permission = this.permissionsRepo.create({
      code: dto.code,
      resource: dto.resource,
      action: dto.action,
      displayName: dto.displayName ?? `${dto.resource}.${dto.action}`,
      description: dto.description ?? null,
      systemModuleCode: dto.systemModuleCode ?? null,
      isCrudAction: dto.isCrudAction ?? true,
    });

    return this.permissionsRepo.save(permission);
  }

  async updatePermission(
    permissionId: string,
    dto: UpdatePermissionDto,
  ): Promise<Permission> {
    const permission = await this.permissionsRepo.findOne({
      where: { id: permissionId },
    });

    if (!permission) {
      throw new NotFoundException('Permission non trouvée');
    }

    if (dto.displayName !== undefined) permission.displayName = dto.displayName;
    if (dto.description !== undefined) permission.description = dto.description;

    return this.permissionsRepo.save(permission);
  }

  async deletePermission(permissionId: string): Promise<void> {
    const permission = await this.permissionsRepo.findOne({
      where: { id: permissionId },
    });

    if (!permission) {
      throw new NotFoundException('Permission non trouvée');
    }

    await this.rolePermissionsRepo.delete({ permissionId });

    await this.permissionsRepo.delete(permissionId);
  }

  async listPermissions(moduleCode?: string): Promise<Permission[]> {
    const query = this.permissionsRepo.createQueryBuilder('p');

    if (moduleCode) {
      query.where('p.systemModuleCode = :moduleCode', { moduleCode });
    }

    return query.orderBy('p.resource', 'ASC').addOrderBy('p.action', 'ASC').getMany();
  }

  async listPermissionsByResource(): Promise<Record<string, Permission[]>> {
    const permissions = await this.permissionsRepo.find({
      order: { resource: 'ASC', action: 'ASC' },
    });

    const grouped: Record<string, Permission[]> = {};
    for (const perm of permissions) {
      if (!grouped[perm.resource]) {
        grouped[perm.resource] = [];
      }
      grouped[perm.resource].push(perm);
    }

    return grouped;
  }

  // Module labels and display order for the grouped-by-module endpoint.
  private static readonly MODULE_META: Record<string, { label: string; order: number }> = {
    global:              { label: 'Administration système',  order: 0 },
    module_a_pilotage:   { label: 'Pilotage',                order: 1 },
    module_b_projects:   { label: 'Projets & Tâches',        order: 2 },
    module_c_rh:         { label: 'Ressources Humaines',     order: 3 },
    module_d_finance:    { label: 'Finance & CRM',           order: 4 },
    module_e_academy:    { label: 'Academy & LMS',           order: 5 },
    module_f_documents:  { label: 'Documents',         order: 6 },
  };

  // Resource labels (human-readable French names)
  private static readonly RESOURCE_LABELS: Record<string, string> = {
    'user':                      'Utilisateurs',
    'role':                      'Rôles',
    'system':                    'Système',
    'project':                   'Projets',
    'project.task':              'Tâches',
    'project.members':           'Membres',
    'project.workflow':          'Workflow',
    'project.reports':           'Rapports',
    'project.settings':          'Paramètres projets',
    'hr.employees':              'Employés',
    'hr.salary':                 'Salaires',
    'hr.bonus':                  'Primes',
    'hr.organizations':          'Organisations RH',
    'hr.attendance':             'Pointage',
    'hr.leave':                  'Congés',
    'hr.documents':              'Documents',
    'hr.required_documents':     'Documents requis',
    'hr.training':               'Formations',
    'hr.evaluation':             'Évaluations',
    'hr.sanctions':              'Sanctions',
    'hr.recruitment':            'Recrutement',
    'hr.internal-life':          'Vie interne',
    'hr.guardian':               'Questionnaires (Guardian)',
    'journal':                   'Journal collaborateur',
    'hr.ticket':                 'Tickets RH (SAV)',
    'hr.rituals':                'Rituels',
    'hr.permissions':            'Permissions RH',
    'hr.settings':               'Paramètres RH',
    // Module D — Finance & CRM
    'contact':                   'Contacts CRM',
    'invoice':                   'Factures',
    'payment':                   'Paiements',
    'finance':                   'Finance (transverse)',
    // Module E — Academy & LMS
    'course':                    'Cours',
    'category':                  'Catégories',
    'enrollment':                'Inscriptions',
    'session':                   'Sessions de formation',
    'academy':                   'Academy (transverse)',
    // Module F — Documents
    'library':                   'Bibliothèques',
    'folder':                    'Dossiers',
    'documents':                 'Documents (transverse)',
  };

  /**
   * Returns permissions grouped first by module, then by resource.
   * Shape: { [moduleCode]: { label, resources: { [resource]: { label, permissions[] } } } }
   */
  async listPermissionsByModule(): Promise<Record<string, {
    label: string;
    resources: Record<string, { label: string; permissions: Permission[] }>;
  }>> {
    const permissions = await this.permissionsRepo.find({
      order: { systemModuleCode: 'ASC', resource: 'ASC', action: 'ASC' },
    });

    const result: Record<string, {
      label: string;
      resources: Record<string, { label: string; permissions: Permission[] }>;
    }> = {};

    for (const perm of permissions) {
      const moduleCode = perm.systemModuleCode || 'global';
      if (!result[moduleCode]) {
        const meta = RbacManagementService.MODULE_META[moduleCode];
        result[moduleCode] = {
          label: meta?.label ?? moduleCode,
          resources: {},
        };
      }
      if (!result[moduleCode].resources[perm.resource]) {
        result[moduleCode].resources[perm.resource] = {
          label: RbacManagementService.RESOURCE_LABELS[perm.resource] ?? perm.resource,
          permissions: [],
        };
      }
      result[moduleCode].resources[perm.resource].permissions.push(perm);
    }

    // Sort modules by display order
    const sorted: typeof result = {};
    const orderedModules = Object.keys(result).sort((a, b) => {
      const oa = RbacManagementService.MODULE_META[a]?.order ?? 99;
      const ob = RbacManagementService.MODULE_META[b]?.order ?? 99;
      return oa - ob;
    });
    for (const key of orderedModules) sorted[key] = result[key];
    return sorted;
  }

  async assignPermissionsToRole(
    roleId: string,
    permissionIds: string[],
    grantedBy: string,
  ): Promise<void> {
    const role = await this.rolesRepo.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Rôle non trouvé');
    }

    const permissions = await this.permissionsRepo.find({
      where: { id: In(permissionIds) },
    });

    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException('Certaines permissions n\'existent pas');
    }

    await this.rolePermissionsRepo.delete({ roleId });

    const rolePermissions = permissionIds.map((permissionId) =>
      this.rolePermissionsRepo.create({
        roleId,
        permissionId,
        grantedBy,
      }),
    );

    await this.rolePermissionsRepo.save(rolePermissions);

    // Invalider le cache des permissions pour tous les utilisateurs de ce rôle
    this.eventEmitter.emit('rbac.role.changed', { roleId });
  }

  async addPermissionToRole(
    roleId: string,
    permissionId: string,
    grantedBy: string,
  ): Promise<void> {
    const existing = await this.rolePermissionsRepo.findOne({
      where: { roleId, permissionId },
    });

    if (existing) {
      return;
    }

    const rolePermission = this.rolePermissionsRepo.create({
      roleId,
      permissionId,
      grantedBy,
    });

    await this.rolePermissionsRepo.save(rolePermission);

    // Invalider le cache des permissions
    this.eventEmitter.emit('rbac.role.changed', { roleId });
  }

  async removePermissionFromRole(
    roleId: string,
    permissionId: string,
  ): Promise<void> {
    await this.rolePermissionsRepo.delete({ roleId, permissionId });

    // Invalider le cache des permissions
    this.eventEmitter.emit('rbac.role.changed', { roleId });
  }

  async getRolePermissions(roleId: string): Promise<Permission[]> {
    const rolePermissions = await this.rolePermissionsRepo.find({
      where: { roleId },
      relations: ['permission'],
    });

    return rolePermissions.map((rp) => rp.permission);
  }
  async assignRoleToUser(
    organizationId: string,
    dto: AssignRoleToUserDto,
    assignedBy: string,
  ): Promise<UserRole> {
    const role = await this.rolesRepo.findOne({
      where: { id: dto.roleId, organizationId },
    });

    if (!role) {
      throw new NotFoundException('Rôle non trouvé');
    }

    // Vérifier si l'utilisateur a déjà ce rôle
    const existing = await this.userRolesRepo.findOne({
      where: { userId: dto.userId, roleId: dto.roleId },
    });

    if (existing) {
      // Mettre à jour l'expiration si fournie
      if (dto.expiresAt !== undefined) {
        existing.expiresAt = dto.expiresAt;
        existing.assignedBy = assignedBy;
        return this.userRolesRepo.save(existing);
      }
      return existing;
    }

    const userRole = this.userRolesRepo.create({
      userId: dto.userId,
      roleId: dto.roleId,
      assignedBy,
      expiresAt: dto.expiresAt ?? null,
      isActive: true,
    });

    const saved = await this.userRolesRepo.save(userRole);

    // Invalider le cache des permissions pour cet utilisateur
    this.eventEmitter.emit('rbac.permissions.changed', { userId: dto.userId, organizationId });

    return saved;
  }

  async removeRoleFromUser(
    organizationId: string,
    userId: string,
    roleId: string,
  ): Promise<void> {
    await this.userRolesRepo.delete({
      userId,
      roleId,
    });

    // Invalider le cache des permissions pour cet utilisateur
    this.eventEmitter.emit('rbac.permissions.changed', { userId, organizationId });
  }

  async getUserRoles(userId: string, organizationId: string): Promise<Role[]> {
    const qb = this.userRolesRepo
      .createQueryBuilder('ur')
      .innerJoinAndSelect('ur.role', 'r')
      .where('ur.userId = :userId', { userId })
      .andWhere('ur.isActive = true')
      .andWhere('r.organizationId = :organizationId', { organizationId });

    const userRoles = await qb.getMany();
    return userRoles.map((ur) => ur.role);
  }

  async getUserPermissions(userId: string, organizationId?: string): Promise<string[]> {
    const qb = this.userRolesRepo
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'r')
      .innerJoin('r.rolePermissions', 'rp')
      .innerJoin('rp.permission', 'p')
      .where('ur.userId = :userId', { userId })
      .andWhere('ur.isActive = true')
      .andWhere('(ur.expiresAt IS NULL OR ur.expiresAt > NOW())')
      .andWhere('r.isActive = true')
      .select('DISTINCT p.code', 'code');

    // Si organizationId est défini, inclure les rôles de cette org + les rôles globaux
    // Sinon, retourner uniquement les permissions des rôles globaux
    if (organizationId) {
      qb.andWhere('(r.organizationId = :organizationId OR r.organizationId IS NULL)', { organizationId });
    } else {
      qb.andWhere('r.organizationId IS NULL');
    }

    const rows = await qb.getRawMany<{ code: string }>();
    return rows.map((r) => r.code).filter((c): c is string => !!c);
  }

  /**
   * Retourne les permissions effectives d'un utilisateur enrichies :
   *   - métadonnées de la permission (displayName, description, module, etc.)
   *   - liste des rôles qui la confèrent (sourceRoles)
   *   - regroupement implicite par systemModuleCode possible côté UI
   * Plus utile pour un affichage RH/admin que `getUserPermissions` (codes nus).
   */
  async getUserEffectivePermissions(
    userId: string,
    organizationId?: string,
  ): Promise<{
    roles: Array<{
      id: string;
      name: string;
      code: string;
      description: string | null;
      roleLevel: number;
      isDefault: boolean;
      organizationId: string | null;
    }>;
    permissions: Array<{
      code: string;
      displayName: string | null;
      description: string | null;
      resource: string;
      action: string;
      systemModuleCode: string | null;
      sourceRoles: Array<{ id: string; name: string; code: string }>;
    }>;
  }> {
    const qb = this.userRolesRepo
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'r')
      .innerJoin('r.rolePermissions', 'rp')
      .innerJoin('rp.permission', 'p')
      .where('ur.userId = :userId', { userId })
      .andWhere('ur.isActive = true')
      .andWhere('(ur.expiresAt IS NULL OR ur.expiresAt > NOW())')
      .andWhere('r.isActive = true')
      .select([
        'p.code AS permission_code',
        'p.display_name AS permission_display_name',
        'p.description AS permission_description',
        'p.resource AS permission_resource',
        'p.action AS permission_action',
        'p.system_module_code AS permission_system_module_code',
        'r.id AS role_id',
        'r.name AS role_name',
        'r.code AS role_code',
        'r.description AS role_description',
        'r.role_level AS role_level',
        'r.is_default AS role_is_default',
        'r.organization_id AS role_organization_id',
      ]);

    if (organizationId) {
      qb.andWhere(
        '(r.organizationId = :organizationId OR r.organizationId IS NULL)',
        { organizationId },
      );
    } else {
      qb.andWhere('r.organizationId IS NULL');
    }

    const rows = await qb.getRawMany<{
      permission_code: string | null;
      permission_display_name: string | null;
      permission_description: string | null;
      permission_resource: string;
      permission_action: string;
      permission_system_module_code: string | null;
      role_id: string;
      role_name: string;
      role_code: string;
      role_description: string | null;
      role_level: number;
      role_is_default: boolean;
      role_organization_id: string | null;
    }>();

    // Agrégation côté JS : un raw row par couple (permission, rôle source).
    const rolesMap = new Map<string, {
      id: string;
      name: string;
      code: string;
      description: string | null;
      roleLevel: number;
      isDefault: boolean;
      organizationId: string | null;
    }>();
    const permsMap = new Map<string, {
      code: string;
      displayName: string | null;
      description: string | null;
      resource: string;
      action: string;
      systemModuleCode: string | null;
      sourceRoles: Array<{ id: string; name: string; code: string }>;
    }>();

    for (const row of rows) {
      if (!rolesMap.has(row.role_id)) {
        rolesMap.set(row.role_id, {
          id: row.role_id,
          name: row.role_name,
          code: row.role_code,
          description: row.role_description,
          roleLevel: row.role_level,
          isDefault: row.role_is_default,
          organizationId: row.role_organization_id,
        });
      }
      if (!row.permission_code) continue;
      let perm = permsMap.get(row.permission_code);
      if (!perm) {
        perm = {
          code: row.permission_code,
          displayName: row.permission_display_name,
          description: row.permission_description,
          resource: row.permission_resource,
          action: row.permission_action,
          systemModuleCode: row.permission_system_module_code,
          sourceRoles: [],
        };
        permsMap.set(row.permission_code, perm);
      }
      if (!perm.sourceRoles.some(sr => sr.id === row.role_id)) {
        perm.sourceRoles.push({
          id: row.role_id,
          name: row.role_name,
          code: row.role_code,
        });
      }
    }

    return {
      roles: Array.from(rolesMap.values()).sort((a, b) => a.roleLevel - b.roleLevel),
      permissions: Array.from(permsMap.values()).sort((a, b) => a.code.localeCompare(b.code)),
    };
  }

  async initializeDefaultPermissions(): Promise<void> {
    const defaultPermissions: CreatePermissionDto[] = [
      // ============================================================
      // MODULE GESTION DE PROJETS (module_b_projects)
      // ============================================================

      // --- PROJETS ---
      {
        code: 'project.create',
        resource: 'project',
        action: 'create',
        displayName: 'Créer un projet',
        description: 'Permet de créer un nouveau projet dans l\'organisation. Le créateur devient automatiquement propriétaire du projet.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: true,
      },
      {
        code: 'project.read',
        resource: 'project',
        action: 'read',
        displayName: 'Consulter les projets',
        description: 'Permet de voir la liste des projets et leurs détails (informations générales, membres, statut, progression).',
        systemModuleCode: 'module_b_projects',
        isCrudAction: true,
      },
      {
        code: 'project.update',
        resource: 'project',
        action: 'update',
        displayName: 'Modifier un projet',
        description: 'Permet de modifier les informations d\'un projet : nom, description, dates, priorité, statut, manager assigné.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: true,
      },
      {
        code: 'project.delete',
        resource: 'project',
        action: 'delete',
        displayName: 'Supprimer un projet',
        description: 'Permet de supprimer définitivement un projet et toutes ses données associées (tâches, commentaires, pièces jointes).',
        systemModuleCode: 'module_b_projects',
        isCrudAction: true,
      },
      {
        code: 'project.archive',
        resource: 'project',
        action: 'archive',
        displayName: 'Archiver/Restaurer un projet',
        description: 'Permet d\'archiver un projet terminé ou de le restaurer. Les projets archivés sont en lecture seule.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: false,
      },
      {
        code: 'project.manage_members',
        resource: 'project',
        action: 'manage_members',
        displayName: 'Gérer les membres du projet',
        description: 'Permet d\'ajouter, retirer et modifier les rôles des membres au sein d\'un projet.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: false,
      },
      {
        code: 'project.manage_workflow',
        resource: 'project',
        action: 'manage_workflow',
        displayName: 'Configurer le workflow',
        description: 'Permet de définir et modifier les étapes du workflow du projet (colonnes Kanban, statuts personnalisés).',
        systemModuleCode: 'module_b_projects',
        isCrudAction: false,
      },

      // --- TÂCHES ---
      {
        code: 'task.create',
        resource: 'task',
        action: 'create',
        displayName: 'Créer une tâche',
        description: 'Permet de créer une nouvelle tâche dans un projet et d\'en définir les attributs (titre, description, assignation, dates).',
        systemModuleCode: 'module_b_projects',
        isCrudAction: true,
      },
      {
        code: 'task.read',
        resource: 'task',
        action: 'read',
        displayName: 'Consulter les tâches',
        description: 'Permet de voir les tâches et leurs détails : description, sous-tâches, commentaires, pièces jointes, historique.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: true,
      },
      {
        code: 'task.update',
        resource: 'task',
        action: 'update',
        displayName: 'Modifier une tâche',
        description: 'Permet de modifier les informations d\'une tâche : titre, description, priorité, dates, assignation, étape.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: true,
      },
      {
        code: 'task.delete',
        resource: 'task',
        action: 'delete',
        displayName: 'Supprimer une tâche',
        description: 'Permet de supprimer définitivement une tâche et toutes ses données associées.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: true,
      },
      {
        code: 'task.validate',
        resource: 'task',
        action: 'validate',
        displayName: 'Valider une tâche',
        description: 'Permet de marquer une tâche comme terminée et validée. Nécessaire pour fermer les demandes de validation.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: false,
      },
      {
        code: 'task.reject',
        resource: 'task',
        action: 'reject',
        displayName: 'Rejeter une tâche',
        description: 'Permet de rejeter une demande de validation avec un motif, renvoyant la tâche en cours.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: false,
      },
      {
        code: 'task.comment',
        resource: 'task',
        action: 'comment',
        displayName: 'Commenter les tâches',
        description: 'Permet d\'ajouter des commentaires sur les tâches et de répondre aux commentaires existants.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: false,
      },
      {
        code: 'task.attach_files',
        resource: 'task',
        action: 'attach_files',
        displayName: 'Ajouter des pièces jointes',
        description: 'Permet de téléverser des fichiers et les associer aux tâches.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: false,
      },
      {
        code: 'task.manage_subtasks',
        resource: 'task',
        action: 'manage_subtasks',
        displayName: 'Gérer les sous-tâches',
        description: 'Permet de créer, modifier et supprimer les sous-tâches d\'une tâche parente.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: false,
      },

      // --- MEMBRES DE PROJET ---
      {
        code: 'member.add',
        resource: 'member',
        action: 'add',
        displayName: 'Ajouter un membre',
        description: 'Permet d\'inviter un utilisateur à rejoindre un projet avec un rôle spécifique.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: false,
      },
      {
        code: 'member.remove',
        resource: 'member',
        action: 'remove',
        displayName: 'Retirer un membre',
        description: 'Permet de retirer un membre d\'un projet. Ses assignations de tâches sont conservées.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: false,
      },
      {
        code: 'member.view',
        resource: 'member',
        action: 'view',
        displayName: 'Voir les membres',
        description: 'Permet de consulter la liste des membres d\'un projet et leurs rôles.',
        systemModuleCode: 'module_b_projects',
        isCrudAction: false,
      },
      {
        code: 'member.update_role',
        resource: 'member',
        action: 'update_role',
        displayName: 'Modifier le rôle d\'un membre',
        description: 'Permet de changer le rôle d\'un membre au sein d\'un projet (ex: contributeur vers manager).',
        systemModuleCode: 'module_b_projects',
        isCrudAction: false,
      },

      // ============================================================
      // MODULE RESSOURCES HUMAINES (module_c_rh)
      // ============================================================

      // --- EMPLOYÉS ---
      {
        code: 'employee.create',
        resource: 'employee',
        action: 'create',
        displayName: 'Créer une fiche employé',
        description: 'Permet d\'enregistrer un nouvel employé dans le système : informations personnelles, contrat, département, poste.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'employee.read',
        resource: 'employee',
        action: 'read',
        displayName: 'Consulter les fiches employés',
        description: 'Permet de voir la liste des employés et leurs informations personnelles et professionnelles.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'employee.update',
        resource: 'employee',
        action: 'update',
        displayName: 'Modifier une fiche employé',
        description: 'Permet de modifier les informations d\'un employé : coordonnées, poste, département, manager, salaire.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'employee.delete',
        resource: 'employee',
        action: 'delete',
        displayName: 'Supprimer une fiche employé',
        description: 'Permet de supprimer définitivement une fiche employé. Action irréversible.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'employee.terminate',
        resource: 'employee',
        action: 'terminate',
        displayName: 'Terminer un contrat',
        description: 'Permet d\'enregistrer la fin de contrat d\'un employé (démission, licenciement, fin de CDD) avec le motif.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'employee.view_sensitive',
        resource: 'employee',
        action: 'view_sensitive',
        displayName: 'Voir les données sensibles',
        description: 'Permet d\'accéder aux informations confidentielles : salaire, numéro de sécurité sociale, données bancaires.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'employee.manage_contract',
        resource: 'employee',
        action: 'manage_contract',
        displayName: 'Gérer les contrats',
        description: 'Permet de créer, modifier et renouveler les contrats de travail (CDI, CDD, intérim).',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },

      // --- PRÉSENCE & POINTAGE ---
      {
        code: 'attendance.checkin',
        resource: 'attendance',
        action: 'checkin',
        displayName: 'Pointer l\'arrivée',
        description: 'Permet d\'enregistrer son heure d\'arrivée via pointage manuel ou géolocalisation.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'attendance.checkout',
        resource: 'attendance',
        action: 'checkout',
        displayName: 'Pointer le départ',
        description: 'Permet d\'enregistrer son heure de départ et clôturer la journée de travail.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'attendance.view_own',
        resource: 'attendance',
        action: 'view_own',
        displayName: 'Voir ses pointages',
        description: 'Permet de consulter son historique de pointages personnels.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'attendance.view_team',
        resource: 'attendance',
        action: 'view_team',
        displayName: 'Voir les pointages de l\'équipe',
        description: 'Permet de consulter les pointages des membres de son équipe ou département.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'attendance.view_all',
        resource: 'attendance',
        action: 'view_all',
        displayName: 'Voir tous les pointages',
        description: 'Permet de consulter les pointages de tous les employés de l\'organisation.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'attendance.manage',
        resource: 'attendance',
        action: 'manage',
        displayName: 'Gérer les pointages',
        description: 'Permet de corriger, valider ou rejeter les pointages des employés. Inclut la gestion des justificatifs.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'attendance.justify',
        resource: 'attendance',
        action: 'justify',
        displayName: 'Justifier une absence',
        description: 'Permet de soumettre un justificatif d\'absence (maladie, congé, formation) pour validation.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'attendance.export',
        resource: 'attendance',
        action: 'export',
        displayName: 'Exporter les pointages',
        description: 'Permet d\'exporter les données de pointage (CSV, Excel, PDF) pour les rapports.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },

      // --- GÉOFENCING (ZONES DE POINTAGE) ---
      {
        code: 'geofence.create',
        resource: 'geofence',
        action: 'create',
        displayName: 'Créer une zone de pointage',
        description: 'Permet de définir une nouvelle zone géographique autorisée pour le pointage (cercle ou polygone).',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'geofence.read',
        resource: 'geofence',
        action: 'read',
        displayName: 'Voir les zones de pointage',
        description: 'Permet de consulter la liste des zones et leurs paramètres (localisation, rayon, horaires).',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'geofence.update',
        resource: 'geofence',
        action: 'update',
        displayName: 'Modifier une zone de pointage',
        description: 'Permet de modifier les paramètres d\'une zone : nom, coordonnées, rayon, horaires autorisés.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'geofence.delete',
        resource: 'geofence',
        action: 'delete',
        displayName: 'Supprimer une zone de pointage',
        description: 'Permet de supprimer une zone de pointage. Les pointages existants sont conservés.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'geofence.assign',
        resource: 'geofence',
        action: 'assign',
        displayName: 'Assigner des zones aux employés',
        description: 'Permet d\'associer des zones de pointage à des employés ou départements spécifiques.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },

      // --- DÉPARTMENTS RH ---
      {
        code: 'hr_department.create',
        resource: 'hr_department',
        action: 'create',
        displayName: 'Créer un département RH',
        description: 'Permet de créer un nouveau département dans l\'organigramme de l\'entreprise.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'hr_department.read',
        resource: 'hr_department',
        action: 'read',
        displayName: 'Voir les départements',
        description: 'Permet de consulter l\'organigramme et les informations des départements.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'hr_department.update',
        resource: 'hr_department',
        action: 'update',
        displayName: 'Modifier un département',
        description: 'Permet de modifier un département : nom, manager, budget, objectifs.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'hr_department.delete',
        resource: 'hr_department',
        action: 'delete',
        displayName: 'Supprimer un département',
        description: 'Permet de supprimer un département. Les employés doivent être réaffectés au préalable.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },

      // --- POSTES ---
      {
        code: 'position.create',
        resource: 'position',
        action: 'create',
        displayName: 'Créer un poste',
        description: 'Permet de définir un nouveau poste avec ses responsabilités et prérequis.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'position.read',
        resource: 'position',
        action: 'read',
        displayName: 'Voir les postes',
        description: 'Permet de consulter la liste des postes et leurs descriptions.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'position.update',
        resource: 'position',
        action: 'update',
        displayName: 'Modifier un poste',
        description: 'Permet de modifier un poste : titre, description, département, hiérarchie.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'position.delete',
        resource: 'position',
        action: 'delete',
        displayName: 'Supprimer un poste',
        description: 'Permet de supprimer un poste inutilisé.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },

      // --- TICKETS RH ---
      {
        code: 'ticket.create',
        resource: 'ticket',
        action: 'create',
        displayName: 'Créer un ticket RH',
        description: 'Permet de soumettre une demande ou signaler un problème au service RH.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'ticket.view_own',
        resource: 'ticket',
        action: 'view_own',
        displayName: 'Voir ses tickets',
        description: 'Permet de consulter ses propres tickets et leur statut.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'ticket.view_all',
        resource: 'ticket',
        action: 'view_all',
        displayName: 'Voir tous les tickets',
        description: 'Permet de consulter tous les tickets de l\'organisation.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'ticket.manage',
        resource: 'ticket',
        action: 'manage',
        displayName: 'Gérer les tickets',
        description: 'Permet d\'assigner, traiter, clôturer les tickets RH.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },

      // --- ÉVALUATIONS ---
      {
        code: 'evaluation.create',
        resource: 'evaluation',
        action: 'create',
        displayName: 'Créer une évaluation',
        description: 'Permet de lancer une campagne d\'évaluation pour un ou plusieurs employés.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'evaluation.view_own',
        resource: 'evaluation',
        action: 'view_own',
        displayName: 'Voir ses évaluations',
        description: 'Permet de consulter ses propres résultats d\'évaluation.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'evaluation.view_team',
        resource: 'evaluation',
        action: 'view_team',
        displayName: 'Voir les évaluations de l\'équipe',
        description: 'Permet de consulter les évaluations des membres de son équipe.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'evaluation.manage',
        resource: 'evaluation',
        action: 'manage',
        displayName: 'Gérer les évaluations',
        description: 'Permet de configurer, valider et clôturer les campagnes d\'évaluation.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'evaluation.configure_kpis',
        resource: 'evaluation',
        action: 'configure_kpis',
        displayName: 'Configurer les KPIs',
        description: 'Permet de définir les indicateurs de performance et leur pondération par poste.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },


      // --- RÈGLEMENTS & DOCUMENTS ---
      {
        code: 'regulation.create',
        resource: 'regulation',
        action: 'create',
        displayName: 'Créer un règlement',
        description: 'Permet de créer un document réglementaire (règlement intérieur, procédure, politique).',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'regulation.read',
        resource: 'regulation',
        action: 'read',
        displayName: 'Voir les règlements',
        description: 'Permet de consulter les documents réglementaires.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'regulation.update',
        resource: 'regulation',
        action: 'update',
        displayName: 'Modifier un règlement',
        description: 'Permet de modifier un document réglementaire existant.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'regulation.delete',
        resource: 'regulation',
        action: 'delete',
        displayName: 'Supprimer un règlement',
        description: 'Permet de supprimer un document réglementaire.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: true,
      },
      {
        code: 'regulation.assign',
        resource: 'regulation',
        action: 'assign',
        displayName: 'Assigner un règlement',
        description: 'Permet d\'assigner un document à des employés pour lecture et signature.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },
      {
        code: 'regulation.sign',
        resource: 'regulation',
        action: 'sign',
        displayName: 'Signer un règlement',
        description: 'Permet de signer électroniquement un document assigné.',
        systemModuleCode: 'module_c_rh',
        isCrudAction: false,
      },

      {
        code: 'role.create',
        resource: 'role',
        action: 'create',
        displayName: 'Créer un rôle',
        description: 'Permet de créer un nouveau rôle avec un ensemble de permissions.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'role.read',
        resource: 'role',
        action: 'read',
        displayName: 'Voir les rôles',
        description: 'Permet de consulter la liste des rôles et leurs permissions associées.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'role.update',
        resource: 'role',
        action: 'update',
        displayName: 'Modifier un rôle',
        description: 'Permet de modifier un rôle : nom, description, niveau hiérarchique.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'role.delete',
        resource: 'role',
        action: 'delete',
        displayName: 'Supprimer un rôle',
        description: 'Permet de supprimer un rôle. Les utilisateurs ayant ce rôle perdent l\'accès associé.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'role.assign_permissions',
        resource: 'role',
        action: 'assign_permissions',
        displayName: 'Assigner des permissions au rôle',
        description: 'Permet d\'ajouter ou retirer des permissions à un rôle.',
        systemModuleCode: 'core',
        isCrudAction: false,
      },
      {
        code: 'role.assign_users',
        resource: 'role',
        action: 'assign_users',
        displayName: 'Assigner des rôles aux utilisateurs',
        description: 'Permet d\'attribuer un rôle à un ou plusieurs utilisateurs.',
        systemModuleCode: 'core',
        isCrudAction: false,
      },

      // --- UTILISATEURS ---
      {
        code: 'user.create',
        resource: 'user',
        action: 'create',
        displayName: 'Créer un utilisateur',
        description: 'Permet de créer un compte utilisateur dans le système.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'user.read',
        resource: 'user',
        action: 'read',
        displayName: 'Voir les utilisateurs',
        description: 'Permet de consulter la liste des utilisateurs et leurs informations.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'user.update',
        resource: 'user',
        action: 'update',
        displayName: 'Modifier un utilisateur',
        description: 'Permet de modifier les informations d\'un utilisateur : nom, email, organisation.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'user.delete',
        resource: 'user',
        action: 'delete',
        displayName: 'Supprimer un utilisateur',
        description: 'Permet de supprimer un compte utilisateur.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'user.reset_password',
        resource: 'user',
        action: 'reset_password',
        displayName: 'Réinitialiser un mot de passe',
        description: 'Permet de réinitialiser le mot de passe d\'un utilisateur.',
        systemModuleCode: 'core',
        isCrudAction: false,
      },
      {
        code: 'user.manage_status',
        resource: 'user',
        action: 'manage_status',
        displayName: 'Activer/Désactiver un utilisateur',
        description: 'Permet d\'activer ou désactiver temporairement un compte utilisateur.',
        systemModuleCode: 'core',
        isCrudAction: false,
      },

      // --- DÉPARTEMENTS (Core) ---
      {
        code: 'department.create',
        resource: 'department',
        action: 'create',
        displayName: 'Créer un département',
        description: 'Permet de créer un nouveau département.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'department.read',
        resource: 'department',
        action: 'read',
        displayName: 'Voir les départements',
        description: 'Permet de consulter la liste des départements.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'department.update',
        resource: 'department',
        action: 'update',
        displayName: 'Modifier un département',
        description: 'Permet de modifier un département.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'department.delete',
        resource: 'department',
        action: 'delete',
        displayName: 'Supprimer un département',
        description: 'Permet de supprimer un département.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },

      // --- MODULES SYSTÈME ---
      {
        code: 'module.read',
        resource: 'module',
        action: 'read',
        displayName: 'Voir les modules',
        description: 'Permet de consulter la liste des modules disponibles.',
        systemModuleCode: 'core',
        isCrudAction: false,
      },
      {
        code: 'module.configure',
        resource: 'module',
        action: 'configure',
        displayName: 'Configurer les modules',
        description: 'Permet d\'activer, désactiver et configurer les modules pour l\'organisation.',
        systemModuleCode: 'core',
        isCrudAction: false,
      },

      // --- ORGANISATIONS ---
      {
        code: 'organization.create',
        resource: 'organization',
        action: 'create',
        displayName: 'Créer une organisation',
        description: 'Permet de créer une nouvelle organisation (filiale, département, entité).',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'organization.read',
        resource: 'organization',
        action: 'read',
        displayName: 'Voir les organisations',
        description: 'Permet de consulter la liste des organisations et leurs informations.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'organization.update',
        resource: 'organization',
        action: 'update',
        displayName: 'Modifier une organisation',
        description: 'Permet de modifier les informations d\'une organisation : nom, adresse, contact, paramètres.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
      {
        code: 'organization.delete',
        resource: 'organization',
        action: 'delete',
        displayName: 'Supprimer une organisation',
        description: 'Permet de supprimer une organisation. Les organisations enfants doivent être supprimées au préalable.',
        systemModuleCode: 'core',
        isCrudAction: true,
      },
    ];

    for (const perm of defaultPermissions) {
      const existing = await this.permissionsRepo.findOne({ where: { code: perm.code } });
      if (!existing) {
        await this.createPermission(perm);
      }
    }
  }
}
