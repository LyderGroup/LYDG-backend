import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { PILOTAGE_MODULE_CODE, PILOTAGE_PERMISSIONS } from './pilotage.permissions';
import { PilotageService } from './pilotage.service';

class CreateKpiDto {
  code!: string;
  name!: string;
  description?: string | null;
  objectiveId?: string | null;
  frequency?: string | null;
  unit?: string | null;
  direction?: string | null;
  targetValue?: string | number | null;
  warningThreshold?: string | number | null;
  criticalThreshold?: string | number | null;
  isActive?: boolean;
  isVisibleDashboard?: boolean;
  displayOrder?: number;
}

class UpdateKpiDto {
  code?: string;
  name?: string;
  description?: string | null;
  objectiveId?: string | null;
  frequency?: string | null;
  unit?: string | null;
  direction?: string | null;
  targetValue?: string | number | null;
  warningThreshold?: string | number | null;
  criticalThreshold?: string | number | null;
  isActive?: boolean;
  isVisibleDashboard?: boolean;
  displayOrder?: number;
}

@UseGuards(PermissionGuard)
@Controller('core/pilotage/kpis')
export class KpisController {
  constructor(private readonly pilotageService: PilotageService) { }

  @Get()
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_KPIS_READ, { moduleCode: PILOTAGE_MODULE_CODE })
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.pilotageService.listKpisForTenant(tenant?.id as string);
  }

  @Post()
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_KPIS_CREATE, { moduleCode: PILOTAGE_MODULE_CODE })
  async create(@Req() req: any, @Body() dto: CreateKpiDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!dto.code || !dto.code.trim()) {
      throw new BadRequestException('Le code KPI est obligatoire');
    }
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Le nom KPI est obligatoire');
    }

    return this.pilotageService.createKpiForTenant(
      tenant?.id as string,
      (currentUser?.id as string) ?? null,
      dto,
    );
  }

  @Patch(':id')
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_KPIS_UPDATE, { moduleCode: PILOTAGE_MODULE_CODE })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateKpiDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    return this.pilotageService.updateKpiForTenant(
      tenant?.id as string,
      id,
      (currentUser?.id as string) ?? null,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_KPIS_DELETE, { moduleCode: PILOTAGE_MODULE_CODE })
  async remove(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.pilotageService.deleteKpiForTenant(tenant?.id as string, id);
  }
}
