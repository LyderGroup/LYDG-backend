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
import { RolesGuard } from '../rbac/roles.guard';
import { Roles, SYSTEM_ROLE } from '../rbac/roles.decorator';
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

@UseGuards(RolesGuard)
@Controller('core/pilotage/kpis')
export class KpisController {
  constructor(private readonly pilotageService: PilotageService) {}

  @Get()
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.pilotageService.listKpisForTenant(tenant?.id as string);
  }

  @Post()
  @Roles(SYSTEM_ROLE)
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
  @Roles(SYSTEM_ROLE)
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
  @Roles(SYSTEM_ROLE)
  async remove(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.pilotageService.deleteKpiForTenant(tenant?.id as string, id);
  }
}
