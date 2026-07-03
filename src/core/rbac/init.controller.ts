import { Controller, Post, UseGuards } from '@nestjs/common';
import { PermissionSeederService } from './permission.seeder.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './role.entity';
import { RolePermission } from './role-permission.entity';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';
import { GLOBAL_PERMISSIONS } from '../global/global.permissions';

@Controller('core/rbac')
@UseGuards(PermissionGuard)
@RequirePermission(GLOBAL_PERMISSIONS.SYSTEM_ADMIN)
export class InitController {
  constructor(
    private readonly permissionSeederService: PermissionSeederService,
    @InjectRepository(Role)
    private rolesRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private rolePermissionsRepo: Repository<RolePermission>,
  ) { }

  @Post('seed-permissions/init')
  async seedPermissionsInit() {
    // Forcer le seeding des permissions (ajoute les manquantes)
    const result = await this.permissionSeederService.seedAllPermissions();
    return {
      success: true,
      message: `Permissions initialisées: ${result.seeded} nouvelles, ${result.assigned} assignations`
    };
  }
}
