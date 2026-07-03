import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RolePermission } from './role-permission.entity';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';
import { GLOBAL_PERMISSIONS } from '../global/global.permissions';

class CreateRolePermissionDto {
  roleId!: string;
  permissionId!: string;
}

@Controller('core/rbac/role-permissions')
@UseGuards(PermissionGuard)
export class RolePermissionsController {
  constructor(
    @InjectRepository(RolePermission)
    private readonly rolePermissionsRepo: Repository<RolePermission>,
  ) { }

  @Get()
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_READ)
  async findAll() {
    return this.rolePermissionsRepo.find({
      relations: ['role', 'permission'],
      order: { grantedAt: 'DESC' },
    });
  }

  @Post()
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_PERMISSIONS_MANAGE)
  async create(@Body() dto: CreateRolePermissionDto) {
    const rp = this.rolePermissionsRepo.create({
      roleId: dto.roleId,
      permissionId: dto.permissionId,
    });
    return this.rolePermissionsRepo.save(rp);
  }

  @Delete(':id')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_PERMISSIONS_MANAGE)
  async remove(@Param('id') id: string) {
    await this.rolePermissionsRepo.delete(id);
    return { deleted: true };
  }
}
