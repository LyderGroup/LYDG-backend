import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { PerformanceReview, ReviewStatus } from '../entities/performance-review.entity';

interface CreatePerformanceReviewInput {
  employeeId: string;
  reviewPeriod: string;
  reviewType?: string;
  reviewDate: Date;
  nextReviewDate?: Date | null;
  reviewerId?: string | null;
  hrReviewerId?: string | null;
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
  ) { }

  async findByEmployee(employeeId: string) {
    return this.repo.find({
      where: { employeeId },
      relations: ['reviewer', 'hrReviewer'],
      order: { reviewDate: 'DESC' },
    });
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
      status: 'draft',
    });
    return this.repo.save(entity);
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
    return this.findOne(id);
  }

  async submit(id: string) {
    await this.repo.update({ id }, { status: 'self_assessment' } as any);
    return this.findOne(id);
  }

  async complete(id: string) {
    await this.repo.update({ id }, { status: 'completed' } as any);
    return this.findOne(id);
  }

  async delete(id: string) {
    await this.repo.delete({ id });
    return { deleted: true };
  }
}
