import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { HrDepartment } from '../entities/department.entity';

interface CreateDepartmentInput {
  organizationId?: string | null;
  parentDepartmentId?: string | null;
  name: string;
  code: string;
  description?: string | null;
  managerId?: string | null;
  location?: string | null;
  costCenter?: string | null;
  isActive?: boolean;
}

interface UpdateDepartmentInput {
  parentDepartmentId?: string | null;
  name?: string;
  code?: string;
  description?: string | null;
  managerId?: string | null;
  location?: string | null;
  costCenter?: string | null;
  isActive?: boolean;
}

interface ListDepartmentsOptions {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(HrDepartment)
    private readonly repo: Repository<HrDepartment>,
  ) { }

  async findPage(organizationId: string, options: ListDepartmentsOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 20;

    const qb = this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.manager', 'manager')
      .leftJoinAndSelect('d.parentDepartment', 'parent')
      .where('d.organization_id = :orgId', { orgId: organizationId });

    if (options.isActive !== undefined) {
      qb.andWhere('d.is_active = :active', { active: options.isActive });
    }

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere('(LOWER(d.name) LIKE :term OR LOWER(d.code) LIKE :term)', { term });
    }

    qb.orderBy('d.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { data: items, meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 } };
  }

  async findOne(organizationId: string, id: string) {
    return this.repo.findOne({
      where: { id, organizationId },
      relations: ['manager', 'parentDepartment', 'children'],
    });
  }

  async create(organizationId: string, input: CreateDepartmentInput) {
    const entity = this.repo.create({
      organizationId,
      parentDepartmentId: input.parentDepartmentId ?? null,
      name: input.name,
      code: input.code,
      description: input.description ?? null,
      managerId: input.managerId ?? null,
      location: input.location ?? null,
      costCenter: input.costCenter ?? null,
      isActive: input.isActive ?? true,
    });
    return this.repo.save(entity);
  }

  async update(organizationId: string, id: string, input: UpdateDepartmentInput) {
    const patch: QueryDeepPartialEntity<HrDepartment> = {};
    if (input.parentDepartmentId !== undefined) patch.parentDepartmentId = input.parentDepartmentId;
    if (input.name) patch.name = input.name;
    if (input.code) patch.code = input.code;
    if (input.description !== undefined) patch.description = input.description;
    if (input.managerId !== undefined) patch.managerId = input.managerId;
    if (input.location !== undefined) patch.location = input.location;
    if (input.costCenter !== undefined) patch.costCenter = input.costCenter;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    if (Object.keys(patch).length === 0) {
      return this.findOne(organizationId, id);
    }

    await this.repo.update({ id, organizationId }, patch);
    return this.findOne(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    await this.repo.delete({ id, organizationId });
    return { deleted: true };
  }
}
