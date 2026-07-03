import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { GuardianQuestion } from '../entities/guardian-question.entity';

interface SubmitAnswersInput {
  employeeId: string;
  q1ClientInterest: boolean;
  q2Reputation: boolean;
  q3Engagement: boolean;
  q4RespectfulRelations: boolean;
  q5SuccessContribution: boolean;
  notes?: string;
  /** YYYY-MM-DD pour répondre aux questions d'un jour passé (max 7 jours). */
  date?: string;
}

@Injectable()
export class GuardianQuestionService {
  constructor(
    @InjectRepository(GuardianQuestion)
    private readonly repo: Repository<GuardianQuestion>,
  ) { }

  async submitAnswers(input: SubmitAnswersInput): Promise<GuardianQuestion> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // BIS-2 : permettre la réponse pour un jour passé (max 7 jours).
    const targetDate = input.date ? new Date(input.date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    if (targetDate.getTime() > today.getTime()) {
      throw new BadRequestException(
        'Impossible de répondre aux questions pour une date future',
      );
    }
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (targetDate.getTime() < sevenDaysAgo.getTime()) {
      throw new BadRequestException(
        'Impossible de répondre à des questions de plus de 7 jours.',
      );
    }

    // Check if already submitted for the target date
    const existing = await this.repo.findOne({
      where: {
        employeeId: input.employeeId,
        questionDate: targetDate,
      },
    });

    if (existing) {
      // Update existing
      existing.q1ClientInterest = input.q1ClientInterest;
      existing.q2Reputation = input.q2Reputation;
      existing.q3Engagement = input.q3Engagement;
      existing.q4RespectfulRelations = input.q4RespectfulRelations;
      existing.q5SuccessContribution = input.q5SuccessContribution;
      existing.yesCount = this.countYes(input);
      existing.notes = input.notes ?? null;
      return this.repo.save(existing);
    }

    // Create new
    const entity = this.repo.create({
      employeeId: input.employeeId,
      questionDate: targetDate,
      q1ClientInterest: input.q1ClientInterest,
      q2Reputation: input.q2Reputation,
      q3Engagement: input.q3Engagement,
      q4RespectfulRelations: input.q4RespectfulRelations,
      q5SuccessContribution: input.q5SuccessContribution,
      yesCount: this.countYes(input),
      notes: input.notes ?? null,
    });
    return this.repo.save(entity);
  }

  private countYes(input: SubmitAnswersInput): number {
    let count = 0;
    if (input.q1ClientInterest) count++;
    if (input.q2Reputation) count++;
    if (input.q3Engagement) count++;
    if (input.q4RespectfulRelations) count++;
    if (input.q5SuccessContribution) count++;
    return count;
  }

  async getTodayAnswers(employeeId: string): Promise<GuardianQuestion | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.repo.findOne({
      where: {
        employeeId,
        questionDate: today,
      },
    });
  }

  async getEmployeeHistory(
    employeeId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<GuardianQuestion[]> {
    const query = this.repo
      .createQueryBuilder('gq')
      .where('gq.employee_id = :employeeId', { employeeId })
      .orderBy('gq.questionDate', 'DESC');

    if (startDate && endDate) {
      query.andWhere('gq.question_date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    return query.getMany();
  }

  async getMonthlyStats(employeeId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of month

    const answers = await this.repo.find({
      where: {
        employeeId,
        questionDate: Between(startDate, endDate),
      },
    });

    const totalDays = answers.length;
    const totalYes = answers.reduce((sum, a) => sum + a.yesCount, 0);
    const maxPossible = totalDays * 5;

    return {
      totalDays,
      totalYes,
      maxPossible,
      averageYesPerDay: totalDays > 0 ? totalYes / totalDays : 0,
      yesRate: maxPossible > 0 ? (totalYes / maxPossible) * 100 : 0,
      answers,
    };
  }

  async getTeamMonthlyStats(
    organizationId: string,
    year: number,
    month: number,
  ) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const answers = await this.repo
      .createQueryBuilder('gq')
      .leftJoinAndSelect('gq.employee', 'employee')
      .leftJoin('employee.organization', 'org')
      .where('org.id = :organizationId OR employee.organization_id = :organizationId', { organizationId })
      .andWhere('gq.question_date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .leftJoinAndSelect('employee.user', 'user')
      .getMany();

    // Group by employee
    const employeeStats = new Map<string, { name: string; totalYes: number; totalDays: number }>();

    for (const answer of answers) {
      const empId = answer.employeeId;
      if (!employeeStats.has(empId)) {
        employeeStats.set(empId, {
          name: `${answer.employee?.user?.firstName || ''} ${answer.employee?.user?.lastName || ''}`.trim(),
          totalYes: 0,
          totalDays: 0,
        });
      }
      const stats = employeeStats.get(empId)!;
      stats.totalYes += answer.yesCount;
      stats.totalDays += 1;
    }

    // Convert to array and calculate rates
    const result = Array.from(employeeStats.entries()).map(([id, stats]) => ({
      employeeId: id,
      employeeName: stats.name,
      totalDays: stats.totalDays,
      totalYes: stats.totalYes,
      averageYesPerDay: stats.totalDays > 0 ? stats.totalYes / stats.totalDays : 0,
      yesRate: stats.totalDays > 0 ? (stats.totalYes / (stats.totalDays * 5)) * 100 : 0,
    }));

    return result.sort((a, b) => b.yesRate - a.yesRate);
  }

  async getAllAnswersForAdmin(
    organizationId: string,
    filters: {
      employeeId?: string;
      departmentId?: string;
      startDate?: Date;
      endDate?: Date;
      minYesCount?: number;
      maxYesCount?: number;
      page: number;
      limit: number;
    },
  ) {
    // Build base query for filtering
    const qb = this.repo.createQueryBuilder('gq');

    // Join employee and filter by organization
    qb.innerJoin('gq.employee', 'employee', 'employee.organization_id = :organizationId', { organizationId });

    // Apply filters
    if (filters.employeeId) {
      qb.andWhere('gq.employee_id = :employeeId', { employeeId: filters.employeeId });
    }

    if (filters.departmentId) {
      qb.andWhere('employee.department_id = :departmentId', { departmentId: filters.departmentId });
    }

    if (filters.startDate && filters.endDate) {
      qb.andWhere('gq.question_date BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    } else if (filters.startDate) {
      qb.andWhere('gq.question_date >= :startDate', { startDate: filters.startDate });
    } else if (filters.endDate) {
      qb.andWhere('gq.question_date <= :endDate', { endDate: filters.endDate });
    }

    if (filters.minYesCount !== undefined) {
      qb.andWhere('gq.yes_count >= :minYesCount', { minYesCount: filters.minYesCount });
    }

    if (filters.maxYesCount !== undefined) {
      qb.andWhere('gq.yes_count <= :maxYesCount', { maxYesCount: filters.maxYesCount });
    }

    // Get total count first
    const totalQuery = qb.clone();
    const total = await totalQuery.getCount();

    // Get paginated IDs
    const skip = (filters.page - 1) * filters.limit;
    qb.select('gq.id', 'id').orderBy('gq.questionDate', 'DESC').skip(skip).take(filters.limit);
    const idsResult = await qb.getRawMany();
    const ids = idsResult.map(r => r.id);

    if (ids.length === 0) {
      return { data: [], total, page: filters.page, limit: filters.limit, totalPages: Math.ceil(total / filters.limit) };
    }

    // Fetch full data with relations by IDs
    const data = await this.repo
      .createQueryBuilder('gq')
      .leftJoinAndSelect('gq.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('employee.department', 'department')
      .where('gq.id IN (:...ids)', { ids })
      .orderBy('gq.questionDate', 'DESC')
      .getMany();

    // Format response
    const formattedData = data.map((answer) => ({
      id: answer.id,
      questionDate: answer.questionDate,
      employeeId: answer.employeeId,
      employeeName: answer.employee?.user
        ? `${answer.employee.user.firstName} ${answer.employee.user.lastName}`.trim()
        : 'N/A',
      departmentId: answer.employee?.departmentId ?? null,
      departmentName: answer.employee?.department?.name ?? null,
      q1ClientInterest: answer.q1ClientInterest,
      q2Reputation: answer.q2Reputation,
      q3Engagement: answer.q3Engagement,
      q4RespectfulRelations: answer.q4RespectfulRelations,
      q5SuccessContribution: answer.q5SuccessContribution,
      yesCount: answer.yesCount,
      notes: answer.notes,
      createdAt: answer.createdAt,
    }));

    return {
      data: formattedData,
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(total / filters.limit),
    };
  }
}
