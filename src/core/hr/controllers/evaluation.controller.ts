import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { EvaluationService } from '../services/evaluation.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

@Controller('core/hr/evaluations')
@UseGuards(PermissionGuard)
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) { }


  @Get('kpis')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_READ_ALL, { moduleCode: 'module_c_rh' })
  async listKpis(@Req() req: any) {
    const organizationId = req.user.organizationId;
    return this.evaluationService.listKpis(organizationId);
  }

  @Post('kpis')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_WRITE, { moduleCode: 'module_c_rh' })
  async createKpi(
    @Req() req: any,
    @Body() body: {
      code: string;
      name: string;
      description?: string;
      category?: string;
      defaultWeightPercent: number;
      scoringRules: Array<{ min: number; max: number; points: number; label?: string }>;
      dataSource?: string;
      calculationFormula?: string;
      autoCalculate?: boolean;
    },
  ) {
    const organizationId = req.user.organizationId;
    return this.evaluationService.createKpi(organizationId, body);
  }

  @Get('kpis/weights/:positionId')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_READ_ALL, { moduleCode: 'module_c_rh' })
  async getKpiWeights(@Param('positionId') positionId: string) {
    return this.evaluationService.getKpiWeights(positionId);
  }

  @Post('kpis/weights/:positionId')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_WRITE, { moduleCode: 'module_c_rh' })
  async setKpiWeights(
    @Req() req: any,
    @Param('positionId') positionId: string,
    @Body() body: { weights: Array<{ kpiId: string; weightPercent: number }> },
  ) {
    const organizationId = req.user.organizationId;
    return this.evaluationService.setKpiWeights(organizationId, positionId, body.weights);
  }


  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_WRITE, { moduleCode: 'module_c_rh' })
  async createEvaluation(
    @Req() req: any,
    @Body() body: {
      employeeId: string;
      periodMonth: number;
      periodYear: number;
      kpiScores: Array<{
        kpiId: string;
        rawScore: number;
        rawValue?: number;
        rawValueUnit?: string;
        notes?: string;
      }>;
      strengths?: string;
      areasForImprovement?: string;
      recommendations?: string;
    },
  ) {
    const organizationId = req.user.organizationId;
    const userId = req.user.id;

    return this.evaluationService.createEvaluation(organizationId, userId, body);
  }

  @Post(':id/submit')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_WRITE, { moduleCode: 'module_c_rh' })
  async submitEvaluation(@Param('id') evaluationId: string) {
    return this.evaluationService.submitEvaluation(evaluationId);
  }

  @Post(':id/validate')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_VALIDATE, { moduleCode: 'module_c_rh' })
  async validateEvaluation(
    @Req() req: any,
    @Param('id') evaluationId: string,
  ) {
    const userId = req.user.id;
    return this.evaluationService.validateEvaluation(evaluationId, userId);
  }

  @Post(':id/contest')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_READ_OWN, { moduleCode: 'module_c_rh' })
  async contestEvaluation(
    @Param('id') evaluationId: string,
    @Body() body: { notes: string },
  ) {
    return this.evaluationService.contestEvaluation(evaluationId, body.notes);
  }

  @Get(':id')
  @RequirePermission([HR_PERMISSIONS.HR_EVALUATION_READ_ALL, HR_PERMISSIONS.HR_EVALUATION_READ_OWN], { moduleCode: 'module_c_rh' })
  async getEvaluationDetails(@Param('id') evaluationId: string) {
    return this.evaluationService.getEvaluationDetails(evaluationId);
  }


  @Get('my/history')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_READ_OWN, { moduleCode: 'module_c_rh' })
  async getMyEvaluations(
    @Req() req: any,
    @Query('year') year?: string,
  ) {
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    return this.evaluationService.getEmployeeEvaluations(
      employeeId,
      year ? parseInt(year) : undefined,
    );
  }


  @Get('team')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_READ_ALL, { moduleCode: 'module_c_rh' })
  async getTeamEvaluations(
    @Req() req: any,
    @Query('departmentId') departmentId?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const organizationId = req.user.organizationId;

    return this.evaluationService.getTeamEvaluations(
      organizationId,
      departmentId,
      month ? parseInt(month) : undefined,
      year ? parseInt(year) : undefined,
    );
  }

  @Get('stats')
  @RequirePermission(HR_PERMISSIONS.HR_EVALUATION_READ_ALL, { moduleCode: 'module_c_rh' })
  async getEvaluationStats(
    @Req() req: any,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const organizationId = req.user.organizationId;

    return this.evaluationService.getEvaluationStats(
      organizationId,
      parseInt(month),
      parseInt(year),
    );
  }
}
