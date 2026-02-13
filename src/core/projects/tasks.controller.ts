import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../rbac/roles.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ProjectsService, type ControlTowerBucket } from './projects.service';

class CreateTaskDto {
  projectId!: string;
  title!: string;
  description?: string | null;
  assigneeId?: string | null;
  reporterId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  priority?: string;
  status?: string;
  progress?: number;
}

class UpdateTaskDto {
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  reporterId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  priority?: string;
  status?: string;
  progress?: number;
}

@UseGuards(RolesGuard)
@Controller('core/projects/tasks')
export class TasksController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get('control-tower')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    [
      'projects.task.read.own',
      'projects.task.read.project',
      'projects.task.read.team',
      'projects.task.read.department',
      'projects.task.read.tenant',
      'projects.task.read.global',
    ],
    { moduleCode: 'module_b_projects' },
  )
  async listControlTower(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];
    const query = req.query ?? {};

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }

    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const bucketRaw =
      typeof query.bucket === 'string' && query.bucket.trim() ? query.bucket.trim() : undefined;

    const bucket =
      bucketRaw === 'overdue' ||
      bucketRaw === 'pending_validation' ||
      bucketRaw === 'in_progress' ||
      bucketRaw === 'completed'
        ? (bucketRaw as ControlTowerBucket)
        : undefined;

    const orgIdsRaw =
      typeof query.organizationIds === 'string' && query.organizationIds.trim()
        ? query.organizationIds.trim()
        : undefined;

    const organizationIds = orgIdsRaw
      ? orgIdsRaw
          .split(',')
          .map((x: string) => x.trim())
          .filter(Boolean)
      : undefined;

    const takeRaw = typeof query.take === 'string' ? Number(query.take) : undefined;

    return this.projectsService.listControlTowerTasks({
      userId: String(currentUser.id),
      contextOrganizationId: String(tenant.id),
      organizationIds,
      bucket,
      take: Number.isFinite(takeRaw as number) ? (takeRaw as number) : undefined,
      permissionCodes,
    });
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission(['projects.task.create.project', 'projects.task.create.tenant'], {
    moduleCode: 'module_b_projects',
  })
  async createTask(@Req() req: any, @Body() dto: CreateTaskDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.createTask({
      contextOrganizationId: String(tenant.id),
      userId: String(currentUser.id),
      permissionCodes,
      dto,
    });
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    [
      'projects.task.write.own',
      'projects.task.write.project',
      'projects.task.write.team',
      'projects.task.write.department',
      'projects.task.write.tenant',
      'projects.task.write.global',
    ],
    { moduleCode: 'module_b_projects' },
  )
  async updateTask(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.updateTask({
      id,
      contextOrganizationId: String(tenant.id),
      userId: String(currentUser.id),
      permissionCodes,
      dto,
    });
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    [
      'projects.task.delete.own',
      'projects.task.delete.project',
      'projects.task.delete.tenant',
      'projects.task.delete.global',
    ],
    { moduleCode: 'module_b_projects' },
  )
  async deleteTask(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    await this.projectsService.deleteTask({
      id,
      contextOrganizationId: String(tenant.id),
      userId: String(currentUser.id),
      permissionCodes,
    });

    return { deleted: true };
  }

  @Post(':id/validate')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    [
      'projects.task.validate.project',
      'projects.task.validate.team',
      'projects.task.validate.department',
      'projects.task.validate.tenant',
      'projects.task.validate.global',
    ],
    { moduleCode: 'module_b_projects' },
  )
  async validateTask(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.validateTask({
      id,
      contextOrganizationId: String(tenant.id),
      userId: String(currentUser.id),
      permissionCodes,
    });
  }

  @Get('control-tower/export')
  @UseGuards(PermissionGuard)
  @RequirePermission('projects.task.export.tenant', { moduleCode: 'module_b_projects' })
  async exportControlTower(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];
    const query = req.query ?? {};

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const bucketRaw =
      typeof query.bucket === 'string' && query.bucket.trim() ? query.bucket.trim() : undefined;

    const bucket =
      bucketRaw === 'overdue' ||
      bucketRaw === 'pending_validation' ||
      bucketRaw === 'in_progress' ||
      bucketRaw === 'completed'
        ? (bucketRaw as ControlTowerBucket)
        : undefined;

    const orgIdsRaw =
      typeof query.organizationIds === 'string' && query.organizationIds.trim()
        ? query.organizationIds.trim()
        : undefined;

    const organizationIds = orgIdsRaw
      ? orgIdsRaw
          .split(',')
          .map((x: string) => x.trim())
          .filter(Boolean)
      : undefined;

    return this.projectsService.exportControlTowerCsv({
      userId: String(currentUser.id),
      contextOrganizationId: String(tenant.id),
      permissionCodes,
      organizationIds,
      bucket,
    });
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    [
      'projects.task.read.own',
      'projects.task.read.team',
      'projects.task.read.department',
      'projects.task.read.tenant',
      'projects.task.read.global',
    ],
    { moduleCode: 'module_b_projects' },
  )
  async getOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.getTaskById({
      id,
      userId: String(currentUser.id),
      contextOrganizationId: String(tenant.id),
      permissionCodes,
    });
  }
}
