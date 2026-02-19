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

class CreateProjectCommentDto {
  content!: string;
}

@UseGuards(RolesGuard)
@Controller('core/projects/projects')
export class ProjectCommentsController {
  constructor(private readonly projectsService: ProjectsService) {}

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
  async listComments(@Req() req: any, @Param('id') projectId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.listProjectComments({
      projectId,
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
  async createComment(
    @Req() req: any,
    @Param('id') projectId: string,
    @Body() dto: CreateProjectCommentDto,
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

    return this.projectsService.createProjectComment({
      projectId,
      userId: String(currentUser.id),
      contextOrganizationId: String(tenant.id),
      permissionCodes,
      dto,
    });
  }
}
