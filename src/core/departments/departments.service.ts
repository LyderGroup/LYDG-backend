import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Department } from './department.entity';

interface CreateDepartmentInput {
  name: string;
  code: string;
  description?: string | null;
  parentDepartmentId?: string | null;
}

interface ListDepartmentsOptions {
  page?: number;
  limit?: number;
  search?: string;
  includeInactive?: boolean;
}

interface UpdateDepartmentInput {
  name?: string;
  code?: string;
  description?: string | null;
  parentDepartmentId?: string | null;
  isActive?: boolean;
}

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentsRepo: Repository<Department>,
  ) {}

  async findPageForTenant(
    organizationId: string,
    options: ListDepartmentsOptions,
  ) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit =
      options.limit && options.limit > 0 && options.limit <= 100
        ? options.limit
        : 20;

    const qb = this.departmentsRepo
      .createQueryBuilder('d')
      .where('d.organization_id = :orgId', { orgId: organizationId });

    if (!options.includeInactive) {
      qb.andWhere('d.is_active = true');
    }

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(d.name) LIKE :term OR LOWER(d.code) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('d.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit) || 1,
      },
    };
  }

  async createForTenant(
    organizationId: string,
    createdBy: string | null,
    input: CreateDepartmentInput,
  ) {
    const department = this.departmentsRepo.create({
      organizationId,
      parentDepartmentId: input.parentDepartmentId ?? null,
      name: input.name,
      code: input.code,
      description: input.description ?? null,
      createdBy: createdBy ?? null,
    });

    return this.departmentsRepo.save(department);
  }

  async updateForTenant(
    organizationId: string,
    id: string,
    _updatedBy: string | null,
    input: UpdateDepartmentInput,
  ) {
    const patch: Partial<Department> = {};

    if (typeof input.name === 'string') {
      patch.name = input.name;
    }
    if (typeof input.code === 'string') {
      patch.code = input.code;
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }
    if (input.parentDepartmentId !== undefined) {
      patch.parentDepartmentId = input.parentDepartmentId;
    }
    if (typeof input.isActive === 'boolean') {
      patch.isActive = input.isActive;
    }

    if (Object.keys(patch).length === 0) {
      return this.departmentsRepo.findOne({ where: { id, organizationId } });
    }

    await this.departmentsRepo.update({ id, organizationId }, patch as any);

    return this.departmentsRepo.findOne({ where: { id, organizationId } });
  }

  async softDeleteForTenant(
    organizationId: string,
    id: string,
    _userId: string | null,
  ) {
    await this.departmentsRepo.update(
      { id, organizationId },
      { isActive: false },
    );
  }

  async restoreForTenant(
    organizationId: string,
    id: string,
    _userId: string | null,
  ) {
    await this.departmentsRepo.update(
      { id, organizationId },
      { isActive: true },
    );
  }

  async hardDeleteForTenant(organizationId: string, id: string) {
    await this.departmentsRepo.delete({ id, organizationId });
  }

  async bulkActionForTenant(
    organizationId: string,
    _userId: string | null,
    action: 'soft-delete' | 'restore' | 'activate' | 'deactivate',
    ids: string[],
  ) {
    if (!ids || ids.length === 0) {
      return { affected: 0 };
    }

    const where = { id: In(ids), organizationId } as any;

    let patch: Partial<Department>;
    switch (action) {
      case 'soft-delete':
        patch = { isActive: false };
        break;
      case 'restore':
      case 'activate':
        patch = { isActive: true };
        break;
      case 'deactivate':
        patch = { isActive: false };
        break;
      default:
        throw new Error('Unsupported bulk action');
    }

    const result = await this.departmentsRepo.update(where, patch as any);
    return { affected: result.affected ?? 0 };
  }
}