import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { ProjectsService } from './projects.service';

class CreateProjectDto {
  departmentId!: string;
  name!: string;
  code!: string;
  description?: string | null;
  managerId?: string | null;
  memberIds?: string[];
}

@UseGuards(RolesGuard)
@Controller('core/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('projects.project.create.tenant', { moduleCode: 'module_b_projects' })
  async createProject(@Req() req: any, @Body() dto: CreateProjectDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.createProject({
      contextOrganizationId: String(tenant.id),
      userId: String(currentUser.id),
      permissionCodes,
      dto,
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
  async getProjectById(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!id || !id.trim()) {
      throw new BadRequestException('id is required');
    }

    return this.projectsService.getProjectById({
      id: String(id),
      userId: String(currentUser.id),
      contextOrganizationId: String(tenant.id),
    });
  }

  @Get(':id/my-tasks')
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
  async listMyTasksForProject(@Req() req: any, @Param('id') projectId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!projectId || !projectId.trim()) {
      throw new BadRequestException('projectId is required');
    }

    return this.projectsService.listMyTasksForProject({
      projectId: String(projectId),
      userId: String(currentUser.id),
      contextOrganizationId: String(tenant.id),
      permissionCodes,
    });
  }
}
