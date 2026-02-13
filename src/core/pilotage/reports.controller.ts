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
import { RolesGuard } from '../rbac/roles.guard';
import { PilotageService } from './pilotage.service';

@UseGuards(RolesGuard)
@Controller('core/pilotage/reports')
export class PilotageReportsController {
  constructor(private readonly pilotageService: PilotageService) {}

  @Get('exports')
  async listExports(@Req() req: any): Promise<any> {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.pilotageService.listReportExportsForTenant(tenant?.id as string);
  }

  @Post('export')
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
