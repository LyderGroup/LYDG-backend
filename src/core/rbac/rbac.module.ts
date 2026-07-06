import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './role.entity';
import { Permission } from './permission.entity';
import { UserRole } from './user-role.entity';
import { RolePermission } from './role-permission.entity';
import { User } from '../users/user.entity';
import { LoginHistory } from '../users/login-history.entity';
import { Organization } from '../organizations/organizations.entity';
import { CoreModule } from '../modules/module.entity';
import { OrganizationModule } from '../modules/organization-module.entity';
import { Employee } from '../hr/employee.entity';
import { RbacService } from './rbac.service';
import { RbacManagementService } from './rbac-management.service';
import { PermissionSeederService } from './permission.seeder.service';
import { RolesGuard } from './roles.guard';
import { PermissionGuard } from './permission.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RbacController } from './rbac.controller';
import { MeController } from './me.controller';
import { InitController } from './init.controller';
import { RolesController } from './roles.controller';
import { UserRolesController } from './user-roles.controller';
import { RolePermissionsController } from './role-permissions.controller';
import { RbacDevController } from './rbac-dev.controller';
import { AuthModule } from '../auth/auth.module';

// Les contrôleurs préfixés `/dev/*` ne sont chargés qu'en environnement non-production.
const isProd = process.env.NODE_ENV === 'production';
const baseControllers = [
  RbacController,
  MeController,
  InitController,
  RolesController,
  UserRolesController,
  RolePermissionsController,
];
const controllers = isProd ? baseControllers : [...baseControllers, RbacDevController];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Role,
      Permission,
      UserRole,
      RolePermission,
      User,
      LoginHistory,
      Organization,
      CoreModule,
      OrganizationModule,
      Employee,
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers,
  providers: [RbacService, RbacManagementService, PermissionSeederService, RolesGuard, PermissionGuard],
  exports: [RbacService, RbacManagementService, PermissionSeederService, RolesGuard, PermissionGuard, TypeOrmModule],
})
export class RbacModule { }
