import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { GuardianQuestionService } from '../services/guardian-question.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

class SubmitAnswersDto {
  @IsBoolean()
  q1ClientInterest!: boolean;

  @IsBoolean()
  q2Reputation!: boolean;

  @IsBoolean()
  q3Engagement!: boolean;

  @IsBoolean()
  q4RespectfulRelations!: boolean;

  @IsBoolean()
  q5SuccessContribution!: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  /** YYYY-MM-DD pour répondre aux questions d'un jour passé (max 7 jours). */
  @IsOptional()
  @IsString()
  date?: string;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/guardian-questions')
export class GuardianQuestionController {
  constructor(private readonly service: GuardianQuestionService) { }

  @Post('submit')
  @RequirePermission(HR_PERMISSIONS.HR_GUARDIAN_WRITE, { moduleCode: 'module_c_rh' })
  async submitAnswers(@Req() req: any, @Body() dto: SubmitAnswersDto) {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      throw new BadRequestException(
        'Votre compte utilisateur n\'est pas associé à un employé. Veuillez contacter votre administrateur pour associer votre compte à une fiche employé.',
      );
    }

    return this.service.submitAnswers({
      employeeId,
      q1ClientInterest: dto.q1ClientInterest,
      q2Reputation: dto.q2Reputation,
      q3Engagement: dto.q3Engagement,
      q4RespectfulRelations: dto.q4RespectfulRelations,
      q5SuccessContribution: dto.q5SuccessContribution,
      notes: dto.notes,
      // BIS-2 : transmettre la date pour la complétion des pointages
      // incomplets (réponse pour un jour passé, max 7 jours).
      date: dto.date,
    });
  }

  @Get('today')
  @RequirePermission(HR_PERMISSIONS.HR_GUARDIAN_READ, { moduleCode: 'module_c_rh' })
  async getTodayAnswers(@Req() req: any) {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      throw new BadRequestException(
        'Votre compte utilisateur n\'est pas associé à un employé. Veuillez contacter votre administrateur pour associer votre compte à une fiche employé.',
      );
    }
    return this.service.getTodayAnswers(employeeId);
  }

  @Get('history')
  @RequirePermission([HR_PERMISSIONS.HR_GUARDIAN_READ, HR_PERMISSIONS.HR_GUARDIAN_READ_ALL], { moduleCode: 'module_c_rh' })
  async getHistory(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const employeeId = req.user?.employeeId;
    const hasAllPermission = req.permissionCodes?.includes(HR_PERMISSIONS.HR_GUARDIAN_READ_ALL);

    if (!hasAllPermission && !employeeId) {
      throw new BadRequestException(
        'Votre compte utilisateur n\'est pas associé à un employé. Veuillez contacter votre administrateur pour associer votre compte à une fiche employé.',
      );
    }

    return this.service.getEmployeeHistory(
      employeeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('stats/monthly')
  @RequirePermission(HR_PERMISSIONS.HR_GUARDIAN_READ, { moduleCode: 'module_c_rh' })
  async getMonthlyStats(
    @Req() req: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      throw new BadRequestException(
        'Votre compte utilisateur n\'est pas associé à un employé. Veuillez contacter votre administrateur pour associer votre compte à une fiche employé.',
      );
    }

    const now = new Date();
    const y = year ? parseInt(year, 10) : now.getFullYear();
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;

    return this.service.getMonthlyStats(employeeId, y, m);
  }

  @Get('stats/team-monthly')
  @RequirePermission(HR_PERMISSIONS.HR_GUARDIAN_READ_ALL, { moduleCode: 'module_c_rh' })
  async getTeamMonthlyStats(
    @Req() req: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }

    const now = new Date();
    const y = year ? parseInt(year, 10) : now.getFullYear();
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;

    return this.service.getTeamMonthlyStats(organizationId, y, m);
  }

  @Get('admin/all')
  @RequirePermission(HR_PERMISSIONS.HR_GUARDIAN_READ_ALL, { moduleCode: 'module_c_rh' })
  async getAllAnswers(
    @Req() req: any,
    @Query('employeeId') employeeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('minYesCount') minYesCount?: string,
    @Query('maxYesCount') maxYesCount?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }

    const pageNum = page ?? 1;
    const limitNum = limit ?? 20;

    return this.service.getAllAnswersForAdmin(organizationId, {
      employeeId,
      departmentId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      minYesCount: minYesCount ? parseInt(minYesCount, 10) : undefined,
      maxYesCount: maxYesCount ? parseInt(maxYesCount, 10) : undefined,
      page: pageNum,
      limit: limitNum,
    });
  }
}
