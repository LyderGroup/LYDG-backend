import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  CreateRoleDto,
  UpdateRoleDto,
  CreatePermissionDto,
  UpdatePermissionDto,
  AssignPermissionsDto,
  AssignRoleToUserDto,
} from './rbac-management.service';
import { RbacManagementService } from './rbac-management.service';
import { PermissionSeederService } from './permission.seeder.service';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';
import { GLOBAL_PERMISSIONS } from '../global/global.permissions';

@Controller('core/rbac')
@UseGuards(PermissionGuard)
export class RbacController {
  constructor(
    private readonly rbacManagementService: RbacManagementService,
    private readonly permissionSeederService: PermissionSeederService,
  ) { }

  // Routes CRUD de rôles gérées par RolesController (pagination, search, bulk)

  @Get('permissions')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_READ)
  async listPermissions(@Query('module') moduleCode?: string) {
    return this.rbacManagementService.listPermissions(moduleCode);
  }

  @Get('permissions/grouped')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_READ)
  async listPermissionsGrouped() {
    return this.rbacManagementService.listPermissionsByModule();
  }

  @Post('permissions')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_CREATE)
  async createPermission(@Body() dto: CreatePermissionDto) {
    return this.rbacManagementService.createPermission(dto);
  }

  @Put('permissions/:id')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_EDIT)
  async updatePermission(
    @Param('id') id: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.rbacManagementService.updatePermission(id, dto);
  }

  @Delete('permissions/:id')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_DELETE)
  async deletePermission(@Param('id') id: string) {
    await this.rbacManagementService.deletePermission(id);
    return { success: true };
  }

  @Get('roles/:id/permissions')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_READ)
  async getRolePermissions(@Param('id') id: string) {
    return this.rbacManagementService.getRolePermissions(id);
  }

  @Put('roles/:id/permissions')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_EDIT)
  async setRolePermissions(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    const userId = req.user.id;
    await this.rbacManagementService.assignPermissionsToRole(id, dto.permissionIds, userId);
    return this.rbacManagementService.getRoleWithPermissions(id);
  }

  @Post('roles/:roleId/permissions/:permissionId')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_EDIT)
  async addPermissionToRole(
    @Req() req: any,
    @Param('roleId') roleId: string,
    @Param('permissionId') permissionId: string,
  ) {
    const userId = req.user.id;
    await this.rbacManagementService.addPermissionToRole(roleId, permissionId, userId);
    return { success: true };
  }

  @Delete('roles/:roleId/permissions/:permissionId')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_EDIT)
  async removePermissionFromRole(
    @Param('roleId') roleId: string,
    @Param('permissionId') permissionId: string,
  ) {
    await this.rbacManagementService.removePermissionFromRole(roleId, permissionId);
    return { success: true };
  }

  @Post('users/roles')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_ASSIGN)
  async assignRoleToUser(
    @Req() req: any,
    @Body() dto: AssignRoleToUserDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    const userId = req.user.id;
    return this.rbacManagementService.assignRoleToUser(organizationId, dto, userId);
  }

  @Delete('users/:userId/roles/:roleId')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_ASSIGN)
  async removeRoleFromUser(
    @Req() req: any,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    await this.rbacManagementService.removeRoleFromUser(organizationId, userId, roleId);
    return { success: true };
  }

  @Get('users/:userId/roles')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_READ)
  async getUserRoles(
    @Req() req: any,
    @Param('userId') userId: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    return this.rbacManagementService.getUserRoles(userId, organizationId);
  }

  @Get('users/:userId/permissions')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_READ)
  async getUserPermissions(
    @Req() req: any,
    @Param('userId') userId: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    return this.rbacManagementService.getUserPermissions(userId, organizationId);
  }

  /**
   * Permissions effectives enrichies : pour chaque permission accordée à
   * l'utilisateur, retourne le libellé, la description, le module et la liste
   * des rôles sources. Utilisé par l'UI RH (drawer profil employé).
   */
  @Get('users/:userId/effective-permissions')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_READ)
  async getUserEffectivePermissions(
    @Req() req: any,
    @Param('userId') userId: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    return this.rbacManagementService.getUserEffectivePermissions(userId, organizationId);
  }


  @Get('my/permissions')
  async getMyPermissions(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;
    const userId = req.user?.id;

    if (!userId) {
      return [];
    }

    return this.rbacManagementService.getUserPermissions(userId, organizationId);
  }

  @Get('my/roles')
  async getMyRoles(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    const userId = req.user.id;
    return this.rbacManagementService.getUserRoles(userId, organizationId);
  }

  @Post('initialize')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_CREATE)
  async initializeDefaultPermissions() {
    await this.rbacManagementService.initializeDefaultPermissions();
    return { success: true, message: 'Permissions par défaut initialisées' };
  }

  @Post('seed-permissions')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_CREATE)
  async seedAllPermissions() {
    const result = await this.permissionSeederService.seedAllPermissions();
    return {
      success: true,
      message: `Permissions seedées: ${result.seeded} nouvelles, ${result.assigned} assignations`
    };
  }

  @Post('seed-permissions-dev')
  async seedAllPermissionsDev() {
    const result = await this.permissionSeederService.seedAllPermissions();
    return {
      success: true,
      message: `Permissions seedées: ${result.seeded} nouvelles, ${result.assigned} assignations`
    };
  }
}
