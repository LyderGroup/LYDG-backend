import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './role.entity';
import { Permission } from './permission.entity';
import { UserRole } from './user-role.entity';
import { RolePermission } from './role-permission.entity';
import { Organization } from '../organizations/organizations.entity';
import { RbacService } from './rbac.service';
import { RolesGuard } from './roles.guard';
import { RolesController } from './roles.controller';
import { PermissionsController } from './permissions.controller';
import { UserRolesController } from './user-roles.controller';
import { RolePermissionsController } from './role-permissions.controller';
import { MeController } from './me.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Role,
      Permission,
      UserRole,
      RolePermission,
      Organization,
    ]),
  ],
  controllers: [
    RolesController,
    PermissionsController,
    UserRolesController,
    RolePermissionsController,
    MeController,
  ],
  providers: [RbacService, RolesGuard],
  exports: [RbacService, RolesGuard, TypeOrmModule],
})
export class RbacModule {}
