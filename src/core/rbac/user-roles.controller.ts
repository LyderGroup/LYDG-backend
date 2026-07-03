import { Body, Controller, Delete, Get, Param, Post, UseGuards, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from './user-role.entity';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';
import { GLOBAL_PERMISSIONS } from '../global/global.permissions';

class CreateUserRoleDto {
  userId!: string;
  roleId!: string;
  expiresAt?: Date | null;
}

@Controller('core/rbac/user-roles')
@UseGuards(PermissionGuard)
export class UserRolesController {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
  ) { }

  @Get()
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_READ_ALL)
  async findAll() {
    return this.userRolesRepo.find({
      relations: ['user', 'role'],
      order: { assignedAt: 'DESC' },
    });
  }

  @Post()
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_ASSIGN)
  async create(@Body() dto: CreateUserRoleDto) {
    const userRole = this.userRolesRepo.create({
      userId: dto.userId,
      roleId: dto.roleId,
      expiresAt: dto.expiresAt ?? null,
    });
    return this.userRolesRepo.save(userRole);
  }

  @Delete(':id')
  @RequirePermission(GLOBAL_PERMISSIONS.ROLE_ASSIGN)
  async remove(@Param('id') id: string) {
    await this.userRolesRepo.delete(id);
    return { deleted: true };
  }
}
