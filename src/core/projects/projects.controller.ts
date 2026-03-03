import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { ProjectsService } from './projects.service';

class CreateProjectV2Dto {
  name!: string;
  code!: string;
  description?: string | null;

  organizationIds!: string[];
  departments!: Array<{ organizationId: string; departmentId: string }>;

  managerIds?: string[];
  memberIds?: string[];
}

@UseGuards(RolesGuard)
@Controller('core/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post('v2')
  @UseGuards(PermissionGuard)
  @RequirePermission('projects.project.create.tenant', { moduleCode: 'module_b_projects' })
  async createProjectV2(@Req() req: any, @Body() dto: CreateProjectV2Dto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const permissionCodes = (req.permissionCodes as string[] | undefined) ?? [];

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.projectsService.createProjectV2({
      contextOrganizationId: String(tenant.id),
      userId: String(currentUser.id),
      permissionCodes,
      dto,
    });
  }
}
