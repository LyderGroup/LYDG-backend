import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { Training, TrainingStatus } from '../entities/training.entity';

interface CreateTrainingInput {
  organizationId?: string | null;
  title: string;
  description?: string | null;
  trainingType?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  location?: string | null;
  costPerParticipant?: number | null;
  currency?: string;
}

interface UpdateTrainingInput {
  title?: string;
  description?: string | null;
  trainingType?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  location?: string | null;
  costPerParticipant?: number | null;
  currency?: string;
  status?: TrainingStatus;
}

interface ListTrainingOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: TrainingStatus;
}

@Injectable()
export class TrainingService {
  constructor(
    @InjectRepository(Training)
    private readonly repo: Repository<Training>,
  ) { }

  async findPage(organizationId: string, options: ListTrainingOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 20;

    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.creator', 'creator')
      .where('t.organization_id = :orgId', { orgId: organizationId });

    if (options.status) {
      qb.andWhere('t.status = :status', { status: options.status });
    }

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere('LOWER(t.title) LIKE :term', { term });
    }

    qb.orderBy('t.start_date', 'ASC')
      .addOrderBy('t.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { data: items, meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 } };
  }

  async findOne(organizationId: string, id: string) {
    return this.repo.findOne({
      where: { id, organizationId },
      relations: ['creator'],
    });
  }

  async create(organizationId: string, createdBy: string, input: CreateTrainingInput) {
    const entity = this.repo.create({
      organizationId,
      title: input.title,
      description: input.description ?? null,
      trainingType: input.trainingType as any ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      location: input.location ?? null,
      costPerParticipant: input.costPerParticipant ?? null,
      currency: input.currency ?? 'XOF',
      status: 'planned',
      createdBy,
    });
    return this.repo.save(entity);
  }

  async update(organizationId: string, id: string, input: UpdateTrainingInput) {
    const patch: QueryDeepPartialEntity<Training> = {};
    if (input.title) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.trainingType) patch.trainingType = input.trainingType as any;
    if (input.startDate !== undefined) patch.startDate = input.startDate;
    if (input.endDate !== undefined) patch.endDate = input.endDate;
    if (input.location !== undefined) patch.location = input.location;
    if (input.costPerParticipant !== undefined) patch.costPerParticipant = input.costPerParticipant;
    if (input.currency) patch.currency = input.currency;
    if (input.status) patch.status = input.status;

    if (Object.keys(patch).length === 0) return this.findOne(organizationId, id);

    await this.repo.update({ id, organizationId }, patch);
    return this.findOne(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    await this.repo.delete({ id, organizationId });
    return { deleted: true };
  }
}
