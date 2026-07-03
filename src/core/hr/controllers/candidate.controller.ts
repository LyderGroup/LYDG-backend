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
import { IsEmail, IsNumber, IsOptional, IsString } from 'class-validator';
import { CandidateService } from '../services/candidate.service';
import { CandidateStatus } from '../entities/candidate.entity';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

class CreateCandidateDto {
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() currentPosition?: string | null;
  @IsOptional() @IsNumber() totalExperienceYears?: number | null;
  @IsOptional() @IsString() source?: string | null;
  @IsOptional() @IsString() resumeUrl?: string | null;
}

class UpdateCandidateDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() currentPosition?: string | null;
  @IsOptional() @IsNumber() totalExperienceYears?: number | null;
  @IsOptional() @IsString() source?: string | null;
  @IsOptional() @IsString() resumeUrl?: string | null;
  @IsOptional() @IsString() status?: string;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/candidates')
export class CandidateController {
  constructor(private readonly service: CandidateService) { }

  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_READ, { moduleCode: 'module_c_rh' })
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const page = query.page ? parseInt(query.page as string, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit as string, 10) : undefined;
    const search = typeof query.search === 'string' ? query.search.trim() : undefined;
    const status = typeof query.status === 'string' ? query.status : undefined;

    return this.service.findPage(tenant?.id as string, { page, limit, search, status });
  }

  @Get(':id')
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_READ, { moduleCode: 'module_c_rh' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Candidat non trouvé');
    return item;
  }

  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_WRITE, { moduleCode: 'module_c_rh' })
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
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_WRITE, { moduleCode: 'module_c_rh' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCandidateDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, {
      ...dto,
      status: dto.status as CandidateStatus | undefined,
    });
  }

  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_RECRUITMENT_MANAGE, { moduleCode: 'module_c_rh' })
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
