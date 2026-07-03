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
import { IsString, MinLength, MaxLength } from 'class-validator';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { ProjectsService } from './projects.service';
import { PROJECT_PERMISSIONS, allScopesOf } from './project.permissions';

class CreateProjectCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}

@UseGuards(RolesGuard)
@Controller('core/projects/projects')
export class ProjectCommentsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get(':id/comments')
  @UseGuards(PermissionGuard)
  @RequirePermission(
    allScopesOf(PROJECT_PERMISSIONS.TASK.READ),
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
    allScopesOf(PROJECT_PERMISSIONS.COMMENT.WRITE),
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
