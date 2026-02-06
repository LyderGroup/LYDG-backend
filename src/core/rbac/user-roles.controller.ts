import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from './user-role.entity';

class CreateUserRoleDto {
  userId!: string;
  roleId!: string;
  expiresAt?: Date | null;
}

@Controller('core/rbac/user-roles')
export class UserRolesController {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
  ) {}

  @Get()
  async findAll() {
    return this.userRolesRepo.find({
      relations: ['user', 'role'],
      order: { assignedAt: 'DESC' },
    });
  }

  @Post()
  async create(@Body() dto: CreateUserRoleDto) {
    const userRole = this.userRolesRepo.create({
      userId: dto.userId,
      roleId: dto.roleId,
      expiresAt: dto.expiresAt ?? null,
    });
    return this.userRolesRepo.save(userRole);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.userRolesRepo.delete(id);
    return { deleted: true };
  }
}
