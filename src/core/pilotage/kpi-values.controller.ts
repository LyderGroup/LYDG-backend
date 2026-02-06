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
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
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

@UseGuards(RolesGuard)
@Controller('core/pilotage/kpi-values')
export class KpiValuesController {
  constructor(private readonly pilotageService: PilotageService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const query = req.query ?? {};
    const kpiId = typeof query.kpiId === 'string' && query.kpiId.trim() ? query.kpiId.trim() : undefined;

    return this.pilotageService.listKpiValuesForTenant(tenant?.id as string, kpiId);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  async remove(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.pilotageService.deleteKpiValueForTenant(tenant?.id as string, id);
  }
}
