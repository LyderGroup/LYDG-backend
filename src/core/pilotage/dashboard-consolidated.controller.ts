import { BadRequestException, Controller, Get, Req, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../rbac/roles.guard';
import { PilotageService } from './pilotage.service';

@UseGuards(RolesGuard)
@Controller('core/pilotage/dashboard/consolidated')
export class PilotageConsolidatedDashboardController {
  constructor(private readonly pilotageService: PilotageService) {}

  @Get()
  async getConsolidatedDashboard(@Req() req: any): Promise<any> {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    if (!currentUser?.id) {
      throw new BadRequestException('Missing user');
    }

    const query = req.query ?? {};

    const organizationIdsRaw =
      typeof query.organizationIds === 'string' && query.organizationIds.trim()
        ? query.organizationIds.trim()
        : undefined;

    const organizationIds = organizationIdsRaw
      ? organizationIdsRaw
          .split(',')
          .map((x: string) => x.trim())
          .filter(Boolean)
      : undefined;

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

    return this.pilotageService.getConsolidatedDashboardForUser({
      userId: String(currentUser.id),
      contextOrganizationId: tenant?.id as string,
      organizationIds,
      periodStart,
      periodEnd,
      periodType: periodType as any,
    });
  }
}
