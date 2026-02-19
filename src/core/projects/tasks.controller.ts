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

class CreateSubtaskDto {
  title!: string;
  description?: string | null;
  dueDate?: string | null;
  position?: number;
}

class UpdateSubtaskDto {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  position?: number;
  isCompleted?: boolean;
}

class CreateTaskCommentDto {
  content!: string;
}

@UseGuards(RolesGuard)
@Controller('core/projects/tasks')
export class TasksController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get('control-tower')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    [
      'projects.task.control_tower.tenant',
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

    const take = Number.isFinite(takeRaw as number) ? (takeRaw as number) : undefined;

    // Backward compatible: if bucket is specified, return a single list.
    if (bucket) {
      return this.projectsService.listControlTowerTasks({
        userId: String(currentUser.id),
        contextOrganizationId: String(tenant.id),
        organizationIds,
        bucket,
        take,
        permissionCodes,
      });
    }

    const takeOverdueRaw = typeof query.takeOverdue === 'string' ? Number(query.takeOverdue) : undefined;
    const takePendingRaw =
      typeof query.takePendingValidation === 'string' ? Number(query.takePendingValidation) : undefined;
    const takeInProgressRaw = typeof query.takeInProgress === 'string' ? Number(query.takeInProgress) : undefined;
    const takeCompletedRaw = typeof query.takeCompleted === 'string' ? Number(query.takeCompleted) : undefined;

    const takeOverdue = take ?? (Number.isFinite(takeOverdueRaw as number) ? (takeOverdueRaw as number) : 40);
    const takePendingValidation =
      take ?? (Number.isFinite(takePendingRaw as number) ? (takePendingRaw as number) : 40);
    const takeInProgress = take ?? (Number.isFinite(takeInProgressRaw as number) ? (takeInProgressRaw as number) : 100);
    const takeCompleted = take ?? (Number.isFinite(takeCompletedRaw as number) ? (takeCompletedRaw as number) : 50);

    const [overdue, pending_validation, in_progress, completed] = await Promise.all([
      this.projectsService.listControlTowerTasks({
        userId: String(currentUser.id),
        contextOrganizationId: String(tenant.id),
        organizationIds,
        bucket: 'overdue',
        take: takeOverdue,
        permissionCodes,
      }),
      this.projectsService.listControlTowerTasks({
        userId: String(currentUser.id),
        contextOrganizationId: String(tenant.id),
        organizationIds,
        bucket: 'pending_validation',
        take: takePendingValidation,
        permissionCodes,
      }),
      this.projectsService.listControlTowerTasks({
        userId: String(currentUser.id),
        contextOrganizationId: String(tenant.id),
        organizationIds,
        bucket: 'in_progress',
        take: takeInProgress,
        permissionCodes,
      }),
      this.projectsService.listControlTowerTasks({
        userId: String(currentUser.id),
        contextOrganizationId: String(tenant.id),
        organizationIds,
        bucket: 'completed',
        take: takeCompleted,
        permissionCodes,
      }),
    ]);

    return {
      overdue,
      pending_validation,
      in_progress,
      completed,
    };
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
      'projects.task.read.project',
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

  @Get(':id/comments')
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
  async listComments(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.listTaskComments({
      taskId: id,
      userId: String(currentUser.id),
      contextOrganizationId: String(tenant.id),
      permissionCodes,
    });
  }

  @Post(':id/comments')
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
  async createComment(@Req() req: any, @Param('id') id: string, @Body() dto: CreateTaskCommentDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.createTaskComment({
      taskId: id,
      userId: String(currentUser.id),
      contextOrganizationId: String(tenant.id),
      permissionCodes,
      dto,
    });
  }

  @Get(':id/subtasks')
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
  async listSubtasks(@Req() req: any, @Param('id') taskId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.listSubtasks({
      taskId,
      userId: String(currentUser.id),
      contextOrganizationId: String(tenant.id),
      permissionCodes,
    });
  }

  @Post(':id/subtasks')
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
  async createSubtask(@Req() req: any, @Param('id') taskId: string, @Body() dto: CreateSubtaskDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.createSubtask({
      taskId,
      userId: String(currentUser.id),
      contextOrganizationId: String(tenant.id),
      permissionCodes,
      dto,
    });
  }

  @Patch('subtasks/:subtaskId')
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
  async updateSubtask(
    @Req() req: any,
    @Param('subtaskId') subtaskId: string,
    @Body() dto: UpdateSubtaskDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.updateSubtask({
      subtaskId,
      userId: String(currentUser.id),
      contextOrganizationId: String(tenant.id),
      permissionCodes,
      dto,
    });
  }

  @Delete('subtasks/:subtaskId')
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
  async deleteSubtask(@Req() req: any, @Param('subtaskId') subtaskId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.deleteSubtask({
      subtaskId,
      userId: String(currentUser.id),
      contextOrganizationId: String(tenant.id),
      permissionCodes,
    });
  }
}
