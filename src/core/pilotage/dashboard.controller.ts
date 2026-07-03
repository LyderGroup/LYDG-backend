import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { PILOTAGE_MODULE_CODE, PILOTAGE_PERMISSIONS } from './pilotage.permissions';
import { PilotageService } from './pilotage.service';

@UseGuards(PermissionGuard)
@Controller('core/pilotage/dashboard')
export class PilotageDashboardController {
  constructor(private readonly pilotageService: PilotageService) {}

  @Get()
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_DASHBOARD_READ, { moduleCode: PILOTAGE_MODULE_CODE })
  async getDashboard(@Req() req: any): Promise<any> {
    const tenant = req.tenant as { id?: string } | undefined;
    const query = req.query ?? {};

    const periodStart =
      typeof query.periodStart === 'string' && query.periodStart.trim()
        ? query.periodStart.trim()
        : undefined;
    const periodEnd =
      typeof query.periodEnd === 'string' && query.periodEnd.trim()
        ? query.periodEnd.trim()
        : undefined;
    const periodType =
      typeof query.periodType === 'string' && query.periodType.trim()
        ? query.periodType.trim()
        : undefined;

    return this.pilotageService.getDashboardForTenant(tenant?.id as string, {
      periodStart,
      periodEnd,
      periodType: periodType as any,
    });
  }
}
