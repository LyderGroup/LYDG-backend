import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, IsNumber } from 'class-validator';
import { DailyJournalService } from '../services/daily-journal.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

class SubmitJournalDto {
  @IsOptional() @IsString()
  accomplishments?: string;
  @IsOptional() @IsString()
  challenges?: string;
  @IsOptional() @IsString()
  learnings?: string;
  @IsOptional() @IsString()
  tomorrowPlan?: string;
  @IsOptional() @IsString()
  mood?: string;
  @IsOptional() @IsNumber()
  productivityScore?: number;
  /** YYYY-MM-DD pour soumettre un journal pour un jour passé (max 7 jours). */
  @IsOptional() @IsString()
  date?: string;
}

class ReviewJournalDto {
  @IsOptional() @IsString()
  feedback?: string;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/journals')
export class DailyJournalController {
  constructor(private readonly service: DailyJournalService) { }

  @Post('submit')
  async submitJournal(@Req() req: any, @Body() dto: SubmitJournalDto) {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }

    return this.service.submitJournal({
      employeeId,
      ...dto,
    });
  }

  @Get('today')
  async getTodayJournal(@Req() req: any) {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }
    const journal = await this.service.getTodayJournal(employeeId);
    if (journal) {
      const hoursSinceCreation = (Date.now() - new Date(journal.createdAt).getTime()) / (1000 * 60 * 60);
      return { ...journal, isEditable: hoursSinceCreation <= 24 };
    }
    return null;
  }

  @Get('history')
  async getHistory(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }

    const journals = await this.service.getEmployeeJournals(
      employeeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
    return journals.map((j) => {
      const hoursSinceCreation = (Date.now() - new Date(j.createdAt).getTime()) / (1000 * 60 * 60);
      return { ...j, isEditable: hoursSinceCreation <= 24 };
    });
  }

  @Get('team')
  @RequirePermission(HR_PERMISSIONS.HR_JOURNAL_READ_TEAM, { moduleCode: 'module_c_rh' })
  async getTeamJournals(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('all') all?: string,
    @Query('limit') limit?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }

    // `?all=true` retourne tous les journaux de l'organisation, sans filtre
    // de date. Plafond paramétrable via ?limit=N (200 par défaut).
    const allMode = all === 'true' || all === '1';

    return this.service.getTeamJournals(organizationId, {
      date: !allMode && date ? new Date(date) : undefined,
      all: allMode,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post(':id/review')
  @RequirePermission(HR_PERMISSIONS.HR_JOURNAL_READ_TEAM, { moduleCode: 'module_c_rh' })
  async reviewJournal(
    @Req() req: any,
    @Param('id') journalId: string,
    @Body() dto: ReviewJournalDto,
  ) {
    const reviewerId = req.user?.employeeId;
    if (!reviewerId) {
      throw new BadRequestException('Employé non trouvé');
    }

    return this.service.reviewJournal({
      journalId,
      reviewedBy: reviewerId,
      feedback: dto.feedback,
    });
  }

  @Get('stats/monthly')
  async getMonthlyStats(
    @Req() req: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }

    const now = new Date();
    const y = year ? parseInt(year, 10) : now.getFullYear();
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;

    return this.service.getMonthlyStats(employeeId, y, m);
  }
}
