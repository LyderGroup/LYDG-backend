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

@UseGuards(RolesGuard)
@Controller('core/pilotage/strategic-objectives')
export class StrategicObjectivesController {
  constructor(private readonly pilotageService: PilotageService) {}

  @Get()
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.pilotageService.listObjectivesForTenant(tenant?.id as string);
  }

  @Post()
  @Roles(SYSTEM_ROLE)
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
  @Roles(SYSTEM_ROLE)
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
  @Roles(SYSTEM_ROLE)
  async remove(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.pilotageService.deleteObjectiveForTenant(tenant?.id as string, id);
  }
}
