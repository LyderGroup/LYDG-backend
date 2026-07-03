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
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { PerformanceReviewService } from '../services/performance-review.service';
import { ReviewStatus } from '../entities/performance-review.entity';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

class CreatePerformanceReviewDto {
  @IsString() employeeId!: string;
  @IsString() reviewPeriod!: string;
  @IsOptional() @IsString() reviewType?: string;
  @IsDateString() reviewDate!: string;
  @IsOptional() @IsDateString() nextReviewDate?: string | null;
  @IsOptional() @IsString() reviewerId?: string | null;
  @IsOptional() @IsString() hrReviewerId?: string | null;
  // La modale unifiée envoie aussi ces champs dès la création.
  @IsOptional() @IsNumber() overallRating?: number | null;
  @IsOptional() @IsString() strengths?: string | null;
  @IsOptional() @IsString() areasForImprovement?: string | null;
  @IsOptional() @IsString() developmentPlan?: string | null;
  @IsOptional() @IsString() recommendation?: string | null;
  @IsOptional() @IsNumber() salaryIncreasePercentage?: number | null;
}

class UpdatePerformanceReviewDto {
  @IsOptional() @IsString() reviewerId?: string | null;
  @IsOptional() @IsString() hrReviewerId?: string | null;
  @IsOptional() @IsNumber() overallRating?: number | null;
  @IsOptional() @IsString() strengths?: string | null;
  @IsOptional() @IsString() areasForImprovement?: string | null;
  @IsOptional() @IsString() developmentPlan?: string | null;
  @IsOptional() @IsString() recommendation?: string | null;
  @IsOptional() @IsNumber() salaryIncreasePercentage?: number | null;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() reviewPeriod?: string;
  @IsOptional() @IsString() reviewType?: string;
  @IsOptional() @IsDateString() reviewDate?: string;
  @IsOptional() @IsDateString() nextReviewDate?: string | null;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/performance-reviews')
export class PerformanceReviewController {
  constructor(private readonly service: PerformanceReviewService) { }

  @Get()
  @RequirePermission([HR_PERMISSIONS.HR_EVALUATION_READ_ALL, HR_PERMISSIONS.HR_EVALUATION_READ_OWN], { moduleCode: 'module_c_rh' })
  async list(
    @Req() req: any,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    // Si employeeId fourni → liste de cet employé (mode "profil").
    if (employeeId) {
      return this.service.findByEmployee(employeeId);
    }
    // Sinon → liste org-wide (mode "onglet Performance" admin RH).
    const orgId = req.tenant?.id as string | undefined;
    if (!orgId) throw new BadRequestException('Tenant non résolu');
    return this.service.findAllForOrg(orgId, {
      status: status as any,
      departmentId,
    });
  }

  @Get('stats/org')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_READ_ALL, { moduleCode: 'module_c_rh' })
  async statsForOrg(@Req() req: any) {
    const orgId = req.tenant?.id as string | undefined;
    if (!orgId) throw new BadRequestException('Tenant non résolu');
    return this.service.getStatsForOrg(orgId);
  }

  @Get(':id')
  @RequirePermission([HR_PERMISSIONS.HR_EVALUATION_READ_ALL, HR_PERMISSIONS.HR_EVALUATION_READ_OWN], { moduleCode: 'module_c_rh' })
  async findOne(@Param('id') id: string) {
    const item = await this.service.findOne(id);
    if (!item) throw new BadRequestException('Évaluation non trouvée');
    return item;
  }

  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_WRITE, { moduleCode: 'module_c_rh' })
  async create(@Body() dto: CreatePerformanceReviewDto) {
    if (!dto.employeeId) throw new BadRequestException('L\'employé est obligatoire');
    if (!dto.reviewPeriod) throw new BadRequestException('La période d\'évaluation est obligatoire');
    if (!dto.reviewDate) throw new BadRequestException('La date d\'évaluation est obligatoire');

    return this.service.create({
      employeeId: dto.employeeId,
      reviewPeriod: dto.reviewPeriod,
      reviewType: dto.reviewType,
      reviewDate: new Date(dto.reviewDate),
      nextReviewDate: dto.nextReviewDate ? new Date(dto.nextReviewDate) : null,
      reviewerId: dto.reviewerId ?? null,
      hrReviewerId: dto.hrReviewerId ?? null,
      overallRating: dto.overallRating ?? null,
      strengths: dto.strengths ?? null,
      areasForImprovement: dto.areasForImprovement ?? null,
      developmentPlan: dto.developmentPlan ?? null,
      recommendation: dto.recommendation ?? null,
      salaryIncreasePercentage: dto.salaryIncreasePercentage ?? null,
    });
  }

  @Patch(':id')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_WRITE, { moduleCode: 'module_c_rh' })
  async update(@Param('id') id: string, @Body() dto: UpdatePerformanceReviewDto) {
    return this.service.update(id, {
      ...dto,
      status: dto.status as ReviewStatus | undefined,
    });
  }

  @Post(':id/submit')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_WRITE, { moduleCode: 'module_c_rh' })
  async submit(@Param('id') id: string) {
    return this.service.submit(id);
  }

  @Post(':id/complete')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_VALIDATE, { moduleCode: 'module_c_rh' })
  async complete(@Param('id') id: string) {
    return this.service.complete(id);
  }

  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_WRITE, { moduleCode: 'module_c_rh' })
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
