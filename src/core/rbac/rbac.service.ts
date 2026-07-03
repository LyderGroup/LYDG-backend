import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { UserRole } from './user-role.entity';
import { Role } from './role.entity';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
    private dataSource: DataSource,
  ) { }

  async userHasAnyRole(
    userId: string,
    roleCodes: string[],
    organizationId?: string,
  ): Promise<boolean> {
    if (!roleCodes.length) {
      return true;
    }

    const qb = this.userRolesRepo
      .createQueryBuilder('ur')
      .innerJoin(Role, 'r', 'r.id = ur.role_id')
      .where('ur.user_id = :userId', { userId })
      .andWhere('ur.is_active = true')
      .andWhere('(ur.expires_at IS NULL OR ur.expires_at > NOW())')
      .andWhere('r.is_active = true')
      .andWhere('r.code IN (:...codes)', { codes: roleCodes })
      .limit(1);

    if (organizationId) {
      qb.andWhere('r.organization_id = :orgId', { orgId: organizationId });
    }

    const match = await qb.getOne();
    return !!match;
  }

  /**
   * Vérifie si un utilisateur a au moins une des permissions spécifiées
   * Remplace les vérifications de rôles hardcodés par un système de permissions dynamique
   */
  async userHasAnyPermission(
    userId: string,
    permissionCodes: string[],
    organizationId?: string,
  ): Promise<boolean> {
    if (!permissionCodes.length) {
      return true;
    }

    const result = await this.dataSource.query(
      `
      SELECT 1
      FROM core.user_roles ur
      INNER JOIN core.roles r ON r.id = ur.role_id
      INNER JOIN core.role_permissions rp ON rp.role_id = r.id
      INNER JOIN core.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND r.is_active = true
        AND p.code = ANY($2)
        AND r.organization_id = $3
      LIMIT 1
      `,
      [userId, permissionCodes, organizationId || null],
    );

    return result.length > 0;
  }

  /**
   * Retourne les IDs des utilisateurs qui ont au moins une des permissions spécifiées
   * Utile pour les notifications et les vérifications de groupe
   */
  async getUserIdsWithAnyPermission(
    permissionCodes: string[],
    organizationId?: string,
  ): Promise<string[]> {
    const result = await this.dataSource.query(
      `
      SELECT DISTINCT ur.user_id
      FROM core.user_roles ur
      INNER JOIN core.roles r ON r.id = ur.role_id
      INNER JOIN core.role_permissions rp ON rp.role_id = r.id
      INNER JOIN core.permissions p ON p.id = rp.permission_id
      WHERE ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND r.is_active = true
        AND p.code = ANY($1)
        AND r.organization_id = $2
      `,
      [permissionCodes, organizationId || null],
    );

    return result.map((row: { user_id: string }) => row.user_id);
  }
}
