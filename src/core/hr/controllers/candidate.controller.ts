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
import { CandidateService } from '../services/candidate.service';
import { CandidateStatus } from '../entities/candidate.entity';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';

class CreateCandidateDto {
  firstName!: string;
  lastName!: string;
  email!: string;
  phone?: string | null;
  currentPosition?: string | null;
  totalExperienceYears?: number | null;
  source?: string | null;
  resumeUrl?: string | null;
}

class UpdateCandidateDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  currentPosition?: string | null;
  totalExperienceYears?: number | null;
  source?: string | null;
  resumeUrl?: string | null;
  status?: string;
}

@UseGuards(RolesGuard)
@Controller('core/hr/candidates')
export class CandidateController {
  constructor(private readonly service: CandidateService) { }

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const page = query.page ? parseInt(query.page as string, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit as string, 10) : undefined;
    const search = typeof query.search === 'string' ? query.search.trim() : undefined;
    const status = typeof query.status === 'string' ? query.status : undefined;

    return this.service.findPage(tenant?.id as string, { page, limit, search, status });
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Candidat non trouvé');
    return item;
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async create(@Req() req: any, @Body() dto: CreateCandidateDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    if (!dto.firstName?.trim()) throw new BadRequestException('Le prénom est obligatoire');
    if (!dto.lastName?.trim()) throw new BadRequestException('Le nom est obligatoire');
    if (!dto.email?.trim()) throw new BadRequestException('L\'email est obligatoire');

    return this.service.create(tenant?.id as string, {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email: dto.email.trim(),
      phone: dto.phone ?? null,
      currentPosition: dto.currentPosition ?? null,
      totalExperienceYears: dto.totalExperienceYears ?? null,
      source: dto.source ?? null,
      resumeUrl: dto.resumeUrl ?? null,
    });
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCandidateDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, {
      ...dto,
      status: dto.status as CandidateStatus | undefined,
    });
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
