import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { PerformanceReview, ReviewStatus } from '../entities/performance-review.entity';
import { Employee } from '../employee.entity';
import { HrRealtimeService } from '../hr-realtime.service';

interface CreatePerformanceReviewInput {
  employeeId: string;
  reviewPeriod: string;
  reviewType?: string;
  reviewDate: Date;
  nextReviewDate?: Date | null;
  reviewerId?: string | null;
  hrReviewerId?: string | null;
  // Champs optionnels remplissables dès la création depuis la modale unifiée.
  overallRating?: number | null;
  strengths?: string | null;
  areasForImprovement?: string | null;
  developmentPlan?: string | null;
  recommendation?: string | null;
  salaryIncreasePercentage?: number | null;
}

interface UpdatePerformanceReviewInput {
  reviewerId?: string | null;
  hrReviewerId?: string | null;
  overallRating?: number | null;
  strengths?: string | null;
  areasForImprovement?: string | null;
  developmentPlan?: string | null;
  recommendation?: string | null;
  salaryIncreasePercentage?: number | null;
  status?: ReviewStatus;
}

@Injectable()
export class PerformanceReviewService {
  constructor(
    @InjectRepository(PerformanceReview)
    private readonly repo: Repository<PerformanceReview>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly realtime: HrRealtimeService,
  ) { }

  /** Récupère organizationId via l'employé associé (pour les émissions RT). */
  private async getOrgId(employeeId: string): Promise<string | null> {
    const emp = await this.employeeRepo.findOne({
      where: { id: employeeId },
      select: ['organizationId'],
    });
    return emp?.organizationId ?? null;
  }

  async findByEmployee(employeeId: string) {
    return this.repo.find({
      where: { employeeId },
      relations: ['reviewer', 'hrReviewer'],
      order: { reviewDate: 'DESC' },
    });
  }

  /**
   * Liste org-wide pour l'onglet "Performance & Suivi" (admin RH).
   * Joint employee + user + department pour que l'UI puisse afficher les
   * noms et services sans requête additionnelle.
   */
  async findAllForOrg(
    organizationId: string,
    options?: { status?: ReviewStatus; departmentId?: string; limit?: number },
  ): Promise<PerformanceReview[]> {
    const qb = this.repo
      .createQueryBuilder('pr')
      .innerJoinAndSelect('pr.employee', 'emp')
      .leftJoinAndSelect('emp.user', 'user')
      .leftJoinAndSelect('emp.department', 'dept')
      .leftJoinAndSelect('pr.reviewer', 'reviewer')
      .leftJoinAndSelect('pr.hrReviewer', 'hrReviewer')
      .where('emp.organization_id = :orgId', { orgId: organizationId })
      // orderBy : propriétés camelCase (TypeORM crash sinon avec joins)
      .orderBy('pr.reviewDate', 'DESC');

    if (options?.status) {
      qb.andWhere('pr.status = :status', { status: options.status });
    }
    if (options?.departmentId) {
      qb.andWhere('emp.department_id = :deptId', { deptId: options.departmentId });
    }
    if (options?.limit) {
      qb.limit(options.limit);
    }

    return qb.getMany();
  }

  /** Stats globales pour les cards d'en-tête de l'onglet Performance. */
  async getStatsForOrg(organizationId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const all = await this.findAllForOrg(organizationId);
    const ratings = all
      .map(r => r.overallRating)
      .filter((r): r is number => typeof r === 'number');

    const avg = ratings.length > 0
      ? ratings.reduce((s, r) => s + r, 0) / ratings.length
      : 0;

    const reviewsThisMonth = all.filter(r =>
      r.reviewDate && new Date(r.reviewDate) >= startOfMonth,
    ).length;

    const topPerformers = all.filter(r =>
      typeof r.overallRating === 'number' && r.overallRating >= 4,
    ).length;

    return {
      averageRating: Math.round(avg * 10) / 10,
      totalReviews: all.length,
      evaluationsThisMonth: reviewsThisMonth,
      topPerformers,
    };
  }

  async findOne(id: string) {
    return this.repo.findOne({
      where: { id },
      relations: ['employee', 'reviewer', 'hrReviewer'],
    });
  }

  async create(input: CreatePerformanceReviewInput) {
    const entity = this.repo.create({
      employeeId: input.employeeId,
      reviewPeriod: input.reviewPeriod,
      reviewType: (input.reviewType as any) ?? 'regular',
      reviewDate: input.reviewDate,
      nextReviewDate: input.nextReviewDate ?? null,
      reviewerId: input.reviewerId ?? null,
      hrReviewerId: input.hrReviewerId ?? null,
      overallRating: input.overallRating ?? null,
      strengths: input.strengths ?? null,
      areasForImprovement: input.areasForImprovement ?? null,
      developmentPlan: input.developmentPlan ?? null,
      recommendation: input.recommendation ?? null,
      salaryIncreasePercentage: input.salaryIncreasePercentage ?? null,
      status: 'draft',
    });
    const saved = await this.repo.save(entity);
    const orgId = await this.getOrgId(saved.employeeId);
    if (orgId) {
      this.realtime.emitPerformanceReviewChanged({
        organizationId: orgId,
        reviewId: saved.id,
        employeeId: saved.employeeId,
        action: 'created',
      });
    }
    return saved;
  }

  async update(id: string, input: UpdatePerformanceReviewInput) {
    const patch: QueryDeepPartialEntity<PerformanceReview> = {};
    if (input.reviewerId !== undefined) patch.reviewerId = input.reviewerId;
    if (input.hrReviewerId !== undefined) patch.hrReviewerId = input.hrReviewerId;
    if (input.overallRating !== undefined) patch.overallRating = input.overallRating;
    if (input.strengths !== undefined) patch.strengths = input.strengths;
    if (input.areasForImprovement !== undefined) patch.areasForImprovement = input.areasForImprovement;
    if (input.developmentPlan !== undefined) patch.developmentPlan = input.developmentPlan;
    if (input.recommendation !== undefined) patch.recommendation = input.recommendation;
    if (input.salaryIncreasePercentage !== undefined) patch.salaryIncreasePercentage = input.salaryIncreasePercentage;
    if (input.status) patch.status = input.status;

    if (Object.keys(patch).length === 0) return this.findOne(id);

    await this.repo.update({ id }, patch);
    const updated = await this.findOne(id);
    if (updated) {
      const orgId = await this.getOrgId(updated.employeeId);
      if (orgId) {
        this.realtime.emitPerformanceReviewChanged({
          organizationId: orgId,
          reviewId: updated.id,
          employeeId: updated.employeeId,
          action: 'updated',
        });
      }
    }
    return updated;
  }

  async submit(id: string) {
    await this.repo.update({ id }, { status: 'self_assessment' } as any);
    const updated = await this.findOne(id);
    if (updated) {
      const orgId = await this.getOrgId(updated.employeeId);
      if (orgId) {
        this.realtime.emitPerformanceReviewChanged({
          organizationId: orgId,
          reviewId: updated.id,
          employeeId: updated.employeeId,
          action: 'updated',
        });
      }
    }
    return updated;
  }

  async complete(id: string) {
    await this.repo.update({ id }, { status: 'completed' } as any);
    const updated = await this.findOne(id);
    if (updated) {
      const orgId = await this.getOrgId(updated.employeeId);
      if (orgId) {
        this.realtime.emitPerformanceReviewChanged({
          organizationId: orgId,
          reviewId: updated.id,
          employeeId: updated.employeeId,
          action: 'completed',
        });
      }
    }
    return updated;
  }

  async delete(id: string) {
    await this.repo.delete({ id });
    return { deleted: true };
  }
}
