import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import { Kpi, ScoringRule } from '../entities/kpi.entity';
import { KpiWeight } from '../entities/kpi-weight.entity';
import { MonthlyEvaluation, EvaluationLevel, EvaluationStatus } from '../entities/monthly-evaluation.entity';
import { EvaluationKpiScore } from '../entities/evaluation-kpi-score.entity';
import { Employee } from '../employee.entity';

export interface CreateEvaluationInput {
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
}

export interface CalculateBonusInput {
  positionId: string;
  totalScore: number;
}

@Injectable()
export class EvaluationService {
  constructor(
    @InjectRepository(Kpi)
    private readonly kpiRepo: Repository<Kpi>,
    @InjectRepository(KpiWeight)
    private readonly kpiWeightRepo: Repository<KpiWeight>,
    @InjectRepository(MonthlyEvaluation)
    private readonly evaluationRepo: Repository<MonthlyEvaluation>,
    @InjectRepository(EvaluationKpiScore)
    private readonly scoreRepo: Repository<EvaluationKpiScore>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly dataSource: DataSource,
  ) { }

  async createKpi(
    organizationId: string,
    input: {
      code: string;
      name: string;
      description?: string;
      category?: string;
      defaultWeightPercent: number;
      scoringRules: ScoringRule[];
      dataSource?: string;
      calculationFormula?: string;
      autoCalculate?: boolean;
    },
  ): Promise<Kpi> {
    const kpi = this.kpiRepo.create({
      organizationId,
      ...input,
    });

    return this.kpiRepo.save(kpi);
  }

  async listKpis(organizationId: string): Promise<Kpi[]> {
    return this.kpiRepo.find({
      where: { organizationId, isActive: true, deletedAt: null as any },
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
  }

  async getKpiWeights(positionId: string): Promise<KpiWeight[]> {
    return this.kpiWeightRepo.find({
      where: { positionId, isActive: true, deletedAt: null as any },
      relations: ['kpi'],
    });
  }

  async setKpiWeights(
    organizationId: string,
    positionId: string,
    weights: Array<{ kpiId: string; weightPercent: number }>,
  ): Promise<KpiWeight[]> {
    const savedWeights: KpiWeight[] = [];

    for (const w of weights) {
      let weight = await this.kpiWeightRepo.findOne({
        where: { positionId, kpiId: w.kpiId },
      });

      if (weight) {
        weight.weightPercent = w.weightPercent;
        weight.isActive = true;
      } else {
        weight = this.kpiWeightRepo.create({
          organizationId,
          positionId,
          kpiId: w.kpiId,
          weightPercent: w.weightPercent,
        });
      }

      savedWeights.push(await this.kpiWeightRepo.save(weight));
    }

    return savedWeights;
  }

  async createEvaluation(
    organizationId: string,
    evaluatedBy: string,
    input: CreateEvaluationInput,
  ): Promise<MonthlyEvaluation> {
    const existing = await this.evaluationRepo.findOne({
      where: {
        employeeId: input.employeeId,
        periodMonth: input.periodMonth,
        periodYear: input.periodYear,
      },
    });

    if (existing) {
      throw new BadRequestException('Une évaluation existe déjà pour cette période');
    }

    const employee = await this.employeeRepo.findOne({
      where: { id: input.employeeId },
    });

    if (!employee) {
      throw new NotFoundException('Employé non trouvé');
    }

    const positionName = employee.positionId ?? '';
    const weights = positionName ? await this.getKpiWeights(positionName) : [];
    const weightMap = new Map(weights.map(w => [w.kpiId, w.weightPercent]));

    let totalWeightedScore = 0;
    let totalWeight = 0;
    const kpiScores: EvaluationKpiScore[] = [];

    for (const scoreInput of input.kpiScores) {
      const kpi = await this.kpiRepo.findOne({
        where: { id: scoreInput.kpiId },
      });

      if (!kpi) continue;

      const weightPercent = weightMap.get(scoreInput.kpiId) ?? kpi.defaultWeightPercent;
      const calculatedScore = this.calculateScoreFromRules(kpi.scoringRules, scoreInput.rawScore);
      const weightedScore = (calculatedScore * weightPercent) / 100;

      totalWeightedScore += weightedScore;
      totalWeight += weightPercent;

      const score = this.scoreRepo.create({
        evaluationId: '', // Sera mis à jour après
        kpiId: scoreInput.kpiId,
        rawScore: scoreInput.rawScore,
        rawValue: scoreInput.rawValue ?? null,
        rawValueUnit: scoreInput.rawValueUnit ?? null,
        calculatedScore,
        scoreLevel: this.getScoreLevel(calculatedScore),
        weightPercent,
        weightedScore,
        details: {},
        notes: scoreInput.notes ?? null,
      });

      kpiScores.push(score);
    }

    const normalizedScore = totalWeight > 0 ? (totalWeightedScore / totalWeight) * 100 : 0;
    const level = this.determineLevel(normalizedScore);
    const levelPoints = Math.round(normalizedScore);

    const performanceBonus = await this.calculatePerformanceBonus(
      positionName,
      levelPoints,
    );

    const evaluation = this.evaluationRepo.create({
      employeeId: input.employeeId,
      organizationId,
      periodMonth: input.periodMonth,
      periodYear: input.periodYear,
      totalScore: normalizedScore,
      weightedScore: totalWeightedScore,
      level,
      levelPoints,
      performanceBonus,
      bonusCurrency: 'XOF',
      status: 'draft' as EvaluationStatus,
      evaluatedBy,
      evaluationDate: new Date(),
      strengths: input.strengths ?? null,
      areasForImprovement: input.areasForImprovement ?? null,
      recommendations: input.recommendations ?? null,
    });

    const savedEvaluation = await this.evaluationRepo.save(evaluation);
    for (const score of kpiScores) {
      score.evaluationId = savedEvaluation.id;
      await this.scoreRepo.save(score);
    }

    return savedEvaluation;
  }

  async submitEvaluation(evaluationId: string): Promise<MonthlyEvaluation> {
    const evaluation = await this.evaluationRepo.findOne({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw new NotFoundException('Évaluation non trouvée');
    }

    if (evaluation.status !== 'draft') {
      throw new BadRequestException('Seule une évaluation en brouillon peut être soumise');
    }

    evaluation.status = 'submitted';
    return this.evaluationRepo.save(evaluation);
  }

  async validateEvaluation(
    evaluationId: string,
    validatedBy: string,
  ): Promise<MonthlyEvaluation> {
    const evaluation = await this.evaluationRepo.findOne({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw new NotFoundException('Évaluation non trouvée');
    }

    if (evaluation.status !== 'submitted') {
      throw new BadRequestException('Seule une évaluation soumise peut être validée');
    }

    evaluation.status = 'validated';
    evaluation.validatedBy = validatedBy;
    evaluation.validatedAt = new Date();

    return this.evaluationRepo.save(evaluation);
  }

  async contestEvaluation(
    evaluationId: string,
    notes: string,
  ): Promise<MonthlyEvaluation> {
    const evaluation = await this.evaluationRepo.findOne({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw new NotFoundException('Évaluation non trouvée');
    }

    evaluation.status = 'contested';
    evaluation.contestationNotes = notes;
    evaluation.contestationDate = new Date();

    return this.evaluationRepo.save(evaluation);
  }

  async getEmployeeEvaluations(
    employeeId: string,
    year?: number,
  ): Promise<MonthlyEvaluation[]> {
    const query = this.evaluationRepo
      .createQueryBuilder('e')
      .where('e.employeeId = :empId', { empId: employeeId })
      .andWhere('e.deletedAt IS NULL');

    if (year) {
      query.andWhere('e.periodYear = :year', { year });
    }

    return query
      .orderBy('e.periodYear', 'DESC')
      .addOrderBy('e.periodMonth', 'DESC')
      .getMany();
  }

  async getEvaluationDetails(evaluationId: string): Promise<MonthlyEvaluation | null> {
    return this.evaluationRepo.findOne({
      where: { id: evaluationId },
      relations: ['kpiScores', 'kpiScores.kpi', 'employee'],
    });
  }

  private calculateScoreFromRules(rules: ScoringRule[], rawValue: number): number {
    for (const rule of rules) {
      if (rawValue >= rule.min && rawValue <= rule.max) {
        return rule.points;
      }
    }
    return 0;
  }

  private getScoreLevel(score: number): string {
    if (score >= 90) return 'EXCELLENCE';
    if (score >= 75) return 'PERFORMANT';
    if (score >= 60) return 'ACCEPTABLE';
    if (score >= 40) return 'INSUFFISANT';
    return 'CRITIQUE';
  }

  private determineLevel(score: number): EvaluationLevel {
    if (score >= 90) return 'EXCELLENCE';
    if (score >= 75) return 'PERFORMANT';
    if (score >= 60) return 'ACCEPTABLE';
    if (score >= 40) return 'INSUFFISANT';
    return 'CRITIQUE';
  }

  private async calculatePerformanceBonus(
    positionId: string,
    score: number,
  ): Promise<number | null> {
    const grid = await this.dataSource.query(
      `
      SELECT bonus_amount 
      FROM module_c_rh.performance_bonus_grids 
      WHERE position_id = $1 
        AND min_score <= $2 
        AND max_score >= $2
        AND is_active = true
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [positionId, score],
    );

    return grid?.[0]?.bonus_amount ?? null;
  }

  async getTeamEvaluations(
    organizationId: string,
    departmentId?: string,
    periodMonth?: number,
    periodYear?: number,
  ): Promise<MonthlyEvaluation[]> {
    const query = this.evaluationRepo
      .createQueryBuilder('e')
      .innerJoin('e.employee', 'emp')
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.deletedAt IS NULL');

    if (departmentId) {
      query.andWhere('emp.departmentId = :deptId', { deptId: departmentId });
    }

    if (periodMonth && periodYear) {
      query.andWhere('e.periodMonth = :month AND e.periodYear = :year', {
        month: periodMonth,
        year: periodYear,
      });
    }

    return query
      .orderBy('e.level', 'ASC')
      .addOrderBy('e.totalScore', 'DESC')
      .getMany();
  }

  async getEvaluationStats(
    organizationId: string,
    periodMonth: number,
    periodYear: number,
  ): Promise<{
    total: number;
    byLevel: Record<EvaluationLevel, number>;
    averageScore: number;
    totalBonuses: number;
  }> {
    const evaluations = await this.evaluationRepo.find({
      where: { organizationId, periodMonth, periodYear, status: 'validated' },
    });

    const byLevel: Record<EvaluationLevel, number> = {
      EXCELLENCE: 0,
      PERFORMANT: 0,
      ACCEPTABLE: 0,
      INSUFFISANT: 0,
      CRITIQUE: 0,
    };

    let totalScore = 0;
    let totalBonuses = 0;

    for (const e of evaluations) {
      byLevel[e.level]++;
      totalScore += e.totalScore;
      if (e.performanceBonus) totalBonuses += e.performanceBonus;
    }

    return {
      total: evaluations.length,
      byLevel,
      averageScore: evaluations.length > 0 ? totalScore / evaluations.length : 0,
      totalBonuses,
    };
  }
}
