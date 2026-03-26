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
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';

@Controller('core/hr/evaluations')
@UseGuards(RolesGuard)
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}
 

  @Get('kpis')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async listKpis(@Req() req: any) {
    const organizationId = req.user.organizationId;
    return this.evaluationService.listKpis(organizationId);
  }

  @Post('kpis')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async getKpiWeights(@Param('positionId') positionId: string) {
    return this.evaluationService.getKpiWeights(positionId);
  }

  @Post('kpis/weights/:positionId')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async setKpiWeights(
    @Req() req: any,
    @Param('positionId') positionId: string,
    @Body() body: { weights: Array<{ kpiId: string; weightPercent: number }> },
  ) {
    const organizationId = req.user.organizationId;
    return this.evaluationService.setKpiWeights(organizationId, positionId, body.weights);
  }
 

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async submitEvaluation(@Param('id') evaluationId: string) {
    return this.evaluationService.submitEvaluation(evaluationId);
  }

  @Post(':id/validate')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async validateEvaluation(
    @Req() req: any,
    @Param('id') evaluationId: string,
  ) {
    const userId = req.user.id;
    return this.evaluationService.validateEvaluation(evaluationId, userId);
  }

  @Post(':id/contest')
  async contestEvaluation(
    @Param('id') evaluationId: string,
    @Body() body: { notes: string },
  ) {
    return this.evaluationService.contestEvaluation(evaluationId, body.notes);
  }

  @Get(':id')
  async getEvaluationDetails(@Param('id') evaluationId: string) {
    return this.evaluationService.getEvaluationDetails(evaluationId);
  }
 

  @Get('my/history')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
