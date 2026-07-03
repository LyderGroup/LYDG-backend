import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, IsArray, IsDateString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { ProjectsService } from './projects.service';
import { PROJECT_PERMISSIONS } from './project.permissions';

class DepartmentAssignmentDto {
  @IsUUID()
  organizationId: string = '';

  @IsUUID()
  departmentId: string = '';
}

class CreateProjectV2Dto {
  @IsString()
  name: string = '';

  @IsString()
  code: string = '';

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsDateString()
  @IsOptional()
  startDate?: string | null;

  @IsDateString()
  @IsOptional()
  plannedEndDate?: string | null;

  @IsArray()
  @IsUUID('4', { each: true })
  organizationIds: string[] = [];

  @ValidateNested({ each: true })
  @Type(() => DepartmentAssignmentDto)
  departments: DepartmentAssignmentDto[] = [];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  managerIds?: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  memberIds?: string[];
}

@UseGuards(RolesGuard)
@Controller('core/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) { }

  @Post('v2')
  @UseGuards(PermissionGuard)
  @RequirePermission(PROJECT_PERMISSIONS.PROJECT.CREATE.TENANT, { moduleCode: 'module_b_projects' })
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
