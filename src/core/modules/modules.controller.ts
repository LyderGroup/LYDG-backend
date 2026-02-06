import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { ModulesService } from './modules.service';

class UpdateOrganizationModuleDto {
  isEnabled!: boolean;
}

@UseGuards(RolesGuard)
@Controller('core/modules')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.modulesService.listForTenant(tenant?.id as string);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateOrganizationModuleDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    return this.modulesService.setEnabledForTenant(
      tenant?.id as string,
      id,
      (currentUser?.id as string) ?? null,
      dto.isEnabled,
    );
  }
}
