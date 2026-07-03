import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { PILOTAGE_MODULE_CODE, PILOTAGE_PERMISSIONS } from './pilotage.permissions';
import { PilotageService } from './pilotage.service';

class CreateKpiValueDto {
  kpiId!: string;
  periodStart!: string;
  periodEnd!: string;
  periodType?: string | null;
  value!: string | number;
  targetValue?: string | number | null;
  notes?: string | null;
}

@UseGuards(PermissionGuard)
@Controller('core/pilotage/kpi-values')
export class KpiValuesController {
  constructor(private readonly pilotageService: PilotageService) { }

  @Get()
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_KPI_VALUES_READ, { moduleCode: PILOTAGE_MODULE_CODE })
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const query = req.query ?? {};
    const kpiId = typeof query.kpiId === 'string' && query.kpiId.trim() ? query.kpiId.trim() : undefined;

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

    return this.pilotageService.listKpiValuesForTenant(tenant?.id as string, {
      kpiId,
      periodStart,
      periodEnd,
      periodType,
    });
  }

  @Post()
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_KPI_VALUES_CREATE, { moduleCode: PILOTAGE_MODULE_CODE })
  async create(@Req() req: any, @Body() dto: CreateKpiValueDto) {
    const tenant = req.tenant as { id?: string } | undefined;

    if (!dto.kpiId || !dto.kpiId.trim()) {
      throw new BadRequestException('kpiId est obligatoire');
    }
    if (!dto.periodStart || !dto.periodStart.trim()) {
      throw new BadRequestException('periodStart est obligatoire');
    }
    if (!dto.periodEnd || !dto.periodEnd.trim()) {
      throw new BadRequestException('periodEnd est obligatoire');
    }
    if (dto.value === null || dto.value === undefined || String(dto.value).trim() === '') {
      throw new BadRequestException('value est obligatoire');
    }

    return this.pilotageService.createKpiValueForTenant(tenant?.id as string, dto);
  }

  @Delete(':id')
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_KPI_VALUES_DELETE, { moduleCode: PILOTAGE_MODULE_CODE })
  async remove(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.pilotageService.deleteKpiValueForTenant(tenant?.id as string, id);
  }
}
