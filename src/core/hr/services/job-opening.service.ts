import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { JobOpening, JobOpeningStatus } from '../entities/job-opening.entity';

interface CreateJobOpeningInput {
  organizationId?: string | null;
  positionId?: string | null;
  jobTitle: string;
  departmentId?: string | null;
  jobDescription?: string | null;
  employmentType?: string | null;
  experienceLevel?: string | null;
  salaryRangeMin?: number | null;
  salaryRangeMax?: number | null;
  currency?: string;
  closingDate?: Date | null;
}

interface UpdateJobOpeningInput {
  positionId?: string | null;
  jobTitle?: string;
  departmentId?: string | null;
  jobDescription?: string | null;
  employmentType?: string | null;
  experienceLevel?: string | null;
  salaryRangeMin?: number | null;
  salaryRangeMax?: number | null;
  currency?: string;
  status?: JobOpeningStatus;
  closingDate?: Date | null;
}

interface ListJobOpeningsOptions {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  status?: JobOpeningStatus;
}

@Injectable()
export class JobOpeningService {
  constructor(
    @InjectRepository(JobOpening)
    private readonly repo: Repository<JobOpening>,
  ) { }

  async findPage(organizationId: string, options: ListJobOpeningsOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 20;

    const qb = this.repo
      .createQueryBuilder('jo')
      .leftJoinAndSelect('jo.position', 'position')
      .leftJoinAndSelect('jo.department', 'department')
      .leftJoinAndSelect('jo.creator', 'creator')
      .where('jo.organization_id = :orgId', { orgId: organizationId });

    if (options.status) {
      qb.andWhere('jo.status = :status', { status: options.status });
    }

    if (options.departmentId) {
      qb.andWhere('jo.department_id = :deptId', { deptId: options.departmentId });
    }

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere('LOWER(jo.job_title) LIKE :term', { term });
    }

    qb.orderBy('jo.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { data: items, meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 } };
  }

  async findOne(organizationId: string, id: string) {
    return this.repo.findOne({
      where: { id, organizationId },
      relations: ['position', 'department', 'creator'],
    });
  }

  async create(organizationId: string, createdBy: string, input: CreateJobOpeningInput) {
    const entity = this.repo.create({
      organizationId,
      positionId: input.positionId ?? null,
      jobTitle: input.jobTitle,
      departmentId: input.departmentId ?? null,
      jobDescription: input.jobDescription ?? null,
      employmentType: input.employmentType ?? null,
      experienceLevel: input.experienceLevel ?? null,
      salaryRangeMin: input.salaryRangeMin ?? null,
      salaryRangeMax: input.salaryRangeMax ?? null,
      currency: input.currency ?? 'XOF',
      status: 'draft',
      createdBy,
      closingDate: input.closingDate ?? null,
    });
    return this.repo.save(entity);
  }

  async update(organizationId: string, id: string, input: UpdateJobOpeningInput) {
    const patch: QueryDeepPartialEntity<JobOpening> = {};
    if (input.positionId !== undefined) patch.positionId = input.positionId;
    if (input.jobTitle) patch.jobTitle = input.jobTitle;
    if (input.departmentId !== undefined) patch.departmentId = input.departmentId;
    if (input.jobDescription !== undefined) patch.jobDescription = input.jobDescription;
    if (input.employmentType !== undefined) patch.employmentType = input.employmentType;
    if (input.experienceLevel !== undefined) patch.experienceLevel = input.experienceLevel;
    if (input.salaryRangeMin !== undefined) patch.salaryRangeMin = input.salaryRangeMin;
    if (input.salaryRangeMax !== undefined) patch.salaryRangeMax = input.salaryRangeMax;
    if (input.currency) patch.currency = input.currency;
    if (input.status) patch.status = input.status;
    if (input.closingDate !== undefined) patch.closingDate = input.closingDate;

    if (Object.keys(patch).length === 0) return this.findOne(organizationId, id);

    await this.repo.update({ id, organizationId }, patch);
    return this.findOne(organizationId, id);
  }

  async publish(organizationId: string, id: string) {
    await this.repo.update({ id, organizationId }, { status: 'published' } as any);
    return this.findOne(organizationId, id);
  }

  async close(organizationId: string, id: string) {
    await this.repo.update({ id, organizationId }, { status: 'filled' } as any);
    return this.findOne(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    await this.repo.delete({ id, organizationId });
    return { deleted: true };
  }
}
