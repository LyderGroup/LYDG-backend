import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './permission.entity';

class CreatePermissionDto {
  code?: string | null;
  systemModuleCode?: string | null;
  resource!: string;
  action!: string;
  displayName?: string | null;
  description?: string | null;
  isCrudAction?: boolean;
}

class UpdatePermissionDto {
  displayName?: string | null;
  description?: string | null;
  isCrudAction?: boolean;
}

@Controller('core/rbac/permissions')
export class PermissionsController {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionsRepo: Repository<Permission>,
  ) { }

  @Get()
  async findAll() {
    return this.permissionsRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.permissionsRepo.findOne({ where: { id } });
  }

  @Post()
  async create(@Body() dto: CreatePermissionDto) {
    const permission = this.permissionsRepo.create({
      code: dto.code ?? null,
      systemModuleCode: dto.systemModuleCode ?? null,
      resource: dto.resource,
      action: dto.action,
      displayName: dto.displayName ?? null,
      description: dto.description ?? null,
      isCrudAction: dto.isCrudAction ?? true,
    });
    return this.permissionsRepo.save(permission);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    await this.permissionsRepo.update(id, {
      displayName: dto.displayName,
      description: dto.description,
      isCrudAction: dto.isCrudAction,
    });
    return this.findOne(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.permissionsRepo.delete(id);
    return { deleted: true };
  }
}
