import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { PILOTAGE_MODULE_CODE, PILOTAGE_PERMISSIONS } from './pilotage.permissions';
import { PilotageService } from './pilotage.service';

@UseGuards(PermissionGuard)
@Controller('core/pilotage/reports')
export class PilotageReportsController {
  constructor(private readonly pilotageService: PilotageService) {}

  @Get('exports')
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_REPORTS_READ, { moduleCode: PILOTAGE_MODULE_CODE })
  async listExports(@Req() req: any): Promise<any> {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.pilotageService.listReportExportsForTenant(tenant?.id as string);
  }

  @Post('export')
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_REPORTS_EXPORT, { moduleCode: PILOTAGE_MODULE_CODE })
  async exportReport(@Req() req: any, @Res() res: Response): Promise<void> {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const body = req.body ?? {};

    const format =
      typeof body.format === 'string' && body.format.trim() ? body.format.trim() : '';

    if (format !== 'pdf' && format !== 'excel') {
      throw new BadRequestException('format must be pdf or excel');
    }

    const organizationIds =
      Array.isArray(body.organizationIds) && body.organizationIds.length > 0
        ? body.organizationIds.map((x: any) => String(x)).filter(Boolean)
        : undefined;

    const periodStart = typeof body.periodStart === 'string' ? body.periodStart : undefined;
    const periodEnd = typeof body.periodEnd === 'string' ? body.periodEnd : undefined;
    const periodType = typeof body.periodType === 'string' ? body.periodType : undefined;

    const exported = await this.pilotageService.generateAndStoreExport({
      format,
      contextOrganizationId: tenant?.id as string,
      userId: (currentUser?.id as string) ?? null,
      organizationIds,
      periodStart,
      periodEnd,
      periodType: periodType as any,
    });

    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.fileName}"`);
    res.send(exported.buffer);
  }
}
