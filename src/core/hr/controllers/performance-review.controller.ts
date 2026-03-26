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
import { PerformanceReviewService } from '../services/performance-review.service';
import { ReviewStatus } from '../entities/performance-review.entity';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';

class CreatePerformanceReviewDto {
  employeeId!: string;
  reviewPeriod!: string;
  reviewType?: string;
  reviewDate!: string;
  nextReviewDate?: string | null;
  reviewerId?: string | null;
  hrReviewerId?: string | null;
}

class UpdatePerformanceReviewDto {
  reviewerId?: string | null;
  hrReviewerId?: string | null;
  overallRating?: number | null;
  strengths?: string | null;
  areasForImprovement?: string | null;
  developmentPlan?: string | null;
  recommendation?: string | null;
  salaryIncreasePercentage?: number | null;
  status?: string;
}

@UseGuards(RolesGuard)
@Controller('core/hr/performance-reviews')
export class PerformanceReviewController {
  constructor(private readonly service: PerformanceReviewService) { }

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async list(@Query('employeeId') employeeId: string) {
    if (!employeeId) throw new BadRequestException('L\'ID employé est obligatoire');
    return this.service.findByEmployee(employeeId);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async findOne(@Param('id') id: string) {
    const item = await this.service.findOne(id);
    if (!item) throw new BadRequestException('Évaluation non trouvée');
    return item;
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
    });
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async update(@Param('id') id: string, @Body() dto: UpdatePerformanceReviewDto) {
    return this.service.update(id, {
      ...dto,
      status: dto.status as ReviewStatus | undefined,
    });
  }

  @Post(':id/submit')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async submit(@Param('id') id: string) {
    return this.service.submit(id);
  }

  @Post(':id/complete')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async complete(@Param('id') id: string) {
    return this.service.complete(id);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
