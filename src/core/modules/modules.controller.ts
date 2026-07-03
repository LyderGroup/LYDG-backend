import { Body, Controller, Get, Param, Patch, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SYSTEM_PERMISSIONS } from '../global/global.permissions';
import { ModulesService } from './modules.service';

class UpdateOrganizationModuleDto {
  @IsBoolean()
  isEnabled!: boolean;
}

@UseGuards(PermissionGuard)
@Controller('core/modules')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) { }

  @Get()
  @RequirePermission(SYSTEM_PERMISSIONS.SYSTEM_CONFIG)
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.modulesService.listForTenant(tenant?.id as string);
  }

  @Get('enabled')
  async listEnabled(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.modulesService.listEnabledForTenant(tenant?.id as string);
  }

  @Patch(':id')
  @RequirePermission(SYSTEM_PERMISSIONS.SYSTEM_CONFIG)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateOrganizationModuleDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Organization ID is required (x-organization-code header missing or invalid)');
    }

    return this.modulesService.setEnabledForTenant(
      tenant.id,
      id,
      (currentUser?.id as string) ?? null,
      dto.isEnabled,
    );
  }
}
