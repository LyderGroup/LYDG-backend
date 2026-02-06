import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RolePermission } from './role-permission.entity';

class CreateRolePermissionDto {
  roleId!: string;
  permissionId!: string;
}

@Controller('core/rbac/role-permissions')
export class RolePermissionsController {
  constructor(
    @InjectRepository(RolePermission)
    private readonly rolePermissionsRepo: Repository<RolePermission>,
  ) {}

  @Get()
  async findAll() {
    return this.rolePermissionsRepo.find({
      relations: ['role', 'permission'],
      order: { grantedAt: 'DESC' },
    });
  }

  @Post()
  async create(@Body() dto: CreateRolePermissionDto) {
    const rp = this.rolePermissionsRepo.create({
      roleId: dto.roleId,
      permissionId: dto.permissionId,
    });
    return this.rolePermissionsRepo.save(rp);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.rolePermissionsRepo.delete(id);
    return { deleted: true };
  }
}
