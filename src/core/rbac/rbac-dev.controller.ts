import { Controller, Post, Get, Headers, UseGuards } from '@nestjs/common';
import { PermissionSeederService } from './permission.seeder.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './permission.entity';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';
import { GLOBAL_PERMISSIONS } from '../global/global.permissions';

@Controller('dev/rbac')
@UseGuards(PermissionGuard)
@RequirePermission(GLOBAL_PERMISSIONS.SYSTEM_ADMIN)
export class RbacDevController {
  constructor(
    private readonly permissionSeederService: PermissionSeederService,
    @InjectRepository(Permission)
    private readonly permissionsRepo: Repository<Permission>,
  ) { }

  @Post('seed-permissions')
  async seedAllPermissions() {
    const result = await this.permissionSeederService.seedAllPermissions();
    return {
      success: true,
      message: `Permissions seedées: ${result.seeded} nouvelles, ${result.assigned} assignations`
    };
  }

  @Get('permissions')
  async listPermissions(@Headers('x-organization-code') orgCode: string) {
    const permissions = await this.permissionsRepo.find({
      order: { code: 'ASC' }
    });
    return {
      success: true,
      count: permissions.length,
      permissions: permissions.map(p => ({
        code: p.code,
        displayName: p.displayName,
        resource: p.resource,
        action: p.action,
        systemModuleCode: p.systemModuleCode
      }))
    };
  }
}
