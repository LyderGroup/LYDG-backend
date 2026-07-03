import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Permission } from './permission.entity';
import { Role } from './role.entity';
import { RolePermission } from './role-permission.entity';
import { HR_PERMISSIONS } from '../hr/hr.permissions';
import {
  PROJECT_PERMISSION_CODES,
  LEGACY_PROJECT_PERMISSION_CODES,
} from '../projects/project.permissions';
import { GLOBAL_PERMISSIONS } from '../global/global.permissions';

@Injectable()
export class PermissionSeederService {
  private readonly logger = new Logger(PermissionSeederService.name);

  constructor(
    @InjectRepository(Permission)
    private permissionsRepo: Repository<Permission>,
    @InjectRepository(Role)
    private rolesRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private rolePermissionsRepo: Repository<RolePermission>,
  ) { }

  async seedAllPermissions(): Promise<{ seeded: number; assigned: number }> {
    this.logger.log('Starting permission seeding...');

    let seeded = 0;
    let assigned = 0;

    // Seed HR permissions
    for (const [key, code] of Object.entries(HR_PERMISSIONS)) {
      const [resource, action] = this.parsePermissionCode(code as string);
      const displayName = this.formatDisplayName(key);

      const existing = await this.permissionsRepo.findOne({ where: { code: code as string } });
      if (!existing) {
        await this.permissionsRepo.save({
          code: code as string,
          resource,
          action,
          displayName,
          description: displayName,
          systemModuleCode: 'hr',
          isCrudAction: !action.includes('.'),
        });
        seeded++;
      }
    }

    // Seed Project permissions — nouvelle nomenclature (projects.X.Y.scope)
    // + ancienne nomenclature (project.X) gardée pour rétro-compat.
    const allProjectCodes = [
      ...PROJECT_PERMISSION_CODES,
      ...LEGACY_PROJECT_PERMISSION_CODES,
    ];
    for (const code of allProjectCodes) {
      const [resource, action] = this.parsePermissionCode(code);
      const displayName = this.formatDisplayName(code.replace(/\./g, '_').toUpperCase());

      const existing = await this.permissionsRepo.findOne({ where: { code } });
      if (!existing) {
        await this.permissionsRepo.save({
          code,
          resource,
          action,
          displayName,
          description: displayName,
          systemModuleCode: 'module_b_projects',
          isCrudAction: !action.includes('.'),
        });
        seeded++;
      }
    }

    // Seed Global permissions
    for (const [key, code] of Object.entries(GLOBAL_PERMISSIONS)) {
      const [resource, action] = this.parsePermissionCode(code as string);
      const displayName = this.formatDisplayName(key);

      const existing = await this.permissionsRepo.findOne({ where: { code: code as string } });
      if (!existing) {
        await this.permissionsRepo.save({
          code: code as string,
          resource,
          action,
          displayName,
          description: displayName,
          systemModuleCode: 'core',
          isCrudAction: !action.includes('.'),
        });
        seeded++;
      }
    }

    this.logger.log(`Seeded ${seeded} new permissions`);

    // Ne pas auto-assigner les permissions aux rôles
    // Les admins doivent gérer les assignations manuellement via l'interface

    return { seeded, assigned: 0 };
  }

  private parsePermissionCode(code: string): [string, string] {
    const parts = code.split('.');
    if (parts.length >= 2) {
      const resource = parts.slice(0, -1).join('.');
      const action = parts[parts.length - 1];
      return [resource, action];
    }
    return [code, 'unknown'];
  }

  private formatDisplayName(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}
