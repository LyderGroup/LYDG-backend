import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TrainingService } from '../services/training.service';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';

class CreateTrainingDto {
  title!: string;
  description?: string | null;
  trainingType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  costPerParticipant?: number | null;
  currency?: string;
}

class UpdateTrainingDto {
  title?: string;
  description?: string | null;
  trainingType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  costPerParticipant?: number | null;
  currency?: string;
  status?: string;
}

@UseGuards(RolesGuard)
@Controller('core/hr/trainings')
export class TrainingController {
  constructor(private readonly service: TrainingService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT', 'EMPLOYEE')
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const page = query.page ? parseInt(query.page as string, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit as string, 10) : undefined;
    const search = typeof query.search === 'string' ? query.search.trim() : undefined;
    const status = typeof query.status === 'string' ? query.status : undefined;

    return this.service.findPage(tenant?.id as string, { page, limit, search, status });
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT', 'EMPLOYEE')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Formation non trouvée');
    return item;
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async create(@Req() req: any, @Body() dto: CreateTrainingDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    if (!dto.title?.trim()) throw new BadRequestException('Le titre est obligatoire');

    return this.service.create(tenant?.id as string, currentUser?.id as string, {
      title: dto.title.trim(),
      description: dto.description ?? null,
      trainingType: dto.trainingType ?? null,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      location: dto.location ?? null,
      costPerParticipant: dto.costPerParticipant ?? null,
      currency: dto.currency ?? 'XOF',
    });
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateTrainingDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, {
      title: dto.title,
      description: dto.description,
      trainingType: dto.trainingType,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      location: dto.location,
      costPerParticipant: dto.costPerParticipant,
      currency: dto.currency,
      status: dto.status as any,
    });
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
