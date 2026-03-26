import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { JobPosition } from '../entities/job-position.entity';

interface CreateJobPositionInput {
  organizationId?: string | null;
  departmentId?: string | null;
  title: string;
  code: string;
  description?: string | null;
  jobFamily?: string | null;
  jobLevel?: string | null;
  salaryGrade?: string | null;
  minSalary?: number | null;
  maxSalary?: number | null;
  isActive?: boolean;
}

interface UpdateJobPositionInput {
  departmentId?: string | null;
  title?: string;
  code?: string;
  description?: string | null;
  jobFamily?: string | null;
  jobLevel?: string | null;
  salaryGrade?: string | null;
  minSalary?: number | null;
  maxSalary?: number | null;
  isActive?: boolean;
}

interface ListJobPositionsOptions {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  isActive?: boolean;
}

@Injectable()
export class JobPositionService {
  constructor(
    @InjectRepository(JobPosition)
    private readonly repo: Repository<JobPosition>,
  ) { }

  async findPage(organizationId: string, options: ListJobPositionsOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 20;

    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.department', 'department')
      .where('p.organization_id = :orgId', { orgId: organizationId });

    if (options.isActive !== undefined) {
      qb.andWhere('p.is_active = :active', { active: options.isActive });
    }

    if (options.departmentId) {
      qb.andWhere('p.department_id = :deptId', { deptId: options.departmentId });
    }

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere('(LOWER(p.title) LIKE :term OR LOWER(p.code) LIKE :term)', { term });
    }

    qb.orderBy('p.title', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { data: items, meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 } };
  }

  async findOne(organizationId: string, id: string) {
    return this.repo.findOne({
      where: { id, organizationId },
      relations: ['department'],
    });
  }

  async create(organizationId: string, input: CreateJobPositionInput) {
    const entity = this.repo.create({
      organizationId,
      departmentId: input.departmentId ?? null,
      title: input.title,
      code: input.code,
      description: input.description ?? null,
      jobFamily: input.jobFamily ?? null,
      jobLevel: input.jobLevel ?? null,
      salaryGrade: input.salaryGrade ?? null,
      minSalary: input.minSalary ?? null,
      maxSalary: input.maxSalary ?? null,
      isActive: input.isActive ?? true,
    });
    return this.repo.save(entity);
  }

  async update(organizationId: string, id: string, input: UpdateJobPositionInput) {
    const patch: QueryDeepPartialEntity<JobPosition> = {};
    if (input.departmentId !== undefined) patch.departmentId = input.departmentId;
    if (input.title) patch.title = input.title;
    if (input.code) patch.code = input.code;
    if (input.description !== undefined) patch.description = input.description;
    if (input.jobFamily !== undefined) patch.jobFamily = input.jobFamily;
    if (input.jobLevel !== undefined) patch.jobLevel = input.jobLevel;
    if (input.salaryGrade !== undefined) patch.salaryGrade = input.salaryGrade;
    if (input.minSalary !== undefined) patch.minSalary = input.minSalary;
    if (input.maxSalary !== undefined) patch.maxSalary = input.maxSalary;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    if (Object.keys(patch).length === 0) return this.findOne(organizationId, id);

    await this.repo.update({ id, organizationId }, patch);
    return this.findOne(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    await this.repo.delete({ id, organizationId });
    return { deleted: true };
  }
}
