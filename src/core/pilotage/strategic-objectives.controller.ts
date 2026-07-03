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

class CreateStrategicObjectiveDto {
  title!: string;
  description?: string | null;
  objectiveType?: string | null;
  periodType?: string | null;
  year!: number;
  quarter?: number | null;
  startDate!: string;
  endDate!: string;
  targetValue?: string | number | null;
  currentValue?: string | number | null;
  unit?: string | null;
  status?: string | null;
  ownerId?: string | null;
  parentObjectiveId?: string | null;
}

class UpdateStrategicObjectiveDto {
  title?: string;
  description?: string | null;
  objectiveType?: string | null;
  periodType?: string | null;
  year?: number;
  quarter?: number | null;
  startDate?: string;
  endDate?: string;
  targetValue?: string | number | null;
  currentValue?: string | number | null;
  unit?: string | null;
  status?: string | null;
  ownerId?: string | null;
  parentObjectiveId?: string | null;
}

@UseGuards(PermissionGuard)
@Controller('core/pilotage/strategic-objectives')
export class StrategicObjectivesController {
  constructor(private readonly pilotageService: PilotageService) { }

  @Get()
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_OBJECTIVES_READ, { moduleCode: PILOTAGE_MODULE_CODE })
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.pilotageService.listObjectivesForTenant(tenant?.id as string);
  }

  @Post()
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_OBJECTIVES_CREATE, { moduleCode: PILOTAGE_MODULE_CODE })
  async create(@Req() req: any, @Body() dto: CreateStrategicObjectiveDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!dto.title || !dto.title.trim()) {
      throw new BadRequestException('Le titre est obligatoire');
    }

    return this.pilotageService.createObjectiveForTenant(
      tenant?.id as string,
      (currentUser?.id as string) ?? null,
      dto,
    );
  }

  @Patch(':id')
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_OBJECTIVES_UPDATE, { moduleCode: PILOTAGE_MODULE_CODE })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateStrategicObjectiveDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    return this.pilotageService.updateObjectiveForTenant(
      tenant?.id as string,
      id,
      (currentUser?.id as string) ?? null,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermission(PILOTAGE_PERMISSIONS.PILOTAGE_OBJECTIVES_DELETE, { moduleCode: PILOTAGE_MODULE_CODE })
  async remove(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.pilotageService.deleteObjectiveForTenant(tenant?.id as string, id);
  }
}
