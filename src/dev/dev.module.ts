import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../core/rbac/permission.entity';
import { Role } from '../core/rbac/role.entity';
import { RolePermission } from '../core/rbac/role-permission.entity';
import { UserRole } from '../core/rbac/user-role.entity';
import { CoreModule } from '../core/modules/module.entity';
import { OrganizationModule } from '../core/modules/organization-module.entity';
import { PermissionSeederService } from '../core/rbac/permission.seeder.service';
import { DevController } from './dev.controller';
import { RbacModule } from '../core/rbac/rbac.module';

/**
 * DevModule n'est chargé qu'en environnement non-production.
 * Le contrôleur expose des outils sensibles (seed permissions) protégés
 * par PermissionGuard + SYSTEM_ADMIN.
 */
@Module({})
export class DevModule {
  static register(): DynamicModule {
    if (process.env.NODE_ENV === 'production') {
      return { module: DevModule, imports: [], controllers: [], providers: [] };
    }
    return {
      module: DevModule,
      imports: [
        TypeOrmModule.forFeature([Permission, Role, RolePermission, UserRole, CoreModule, OrganizationModule]),
        RbacModule,
      ],
      controllers: [DevController],
      providers: [PermissionSeederService],
    };
  }
}
