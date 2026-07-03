import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { Candidate, CandidateStatus } from '../entities/candidate.entity';

interface CreateCandidateInput {
  organizationId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  currentPosition?: string | null;
  totalExperienceYears?: number | null;
  source?: string | null;
  resumeUrl?: string | null;
}

interface UpdateCandidateInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  currentPosition?: string | null;
  totalExperienceYears?: number | null;
  source?: string | null;
  resumeUrl?: string | null;
  status?: CandidateStatus;
}

interface ListCandidatesOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: CandidateStatus;
}

@Injectable()
export class CandidateService {
  constructor(
    @InjectRepository(Candidate)
    private readonly repo: Repository<Candidate>,
  ) { }

  async findPage(organizationId: string, options: ListCandidatesOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 20;

    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.applications', 'applications')
      .where('c.organization_id = :orgId', { orgId: organizationId });

    if (options.status) {
      qb.andWhere('c.status = :status', { status: options.status });
    }

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere('(LOWER(c.first_name) LIKE :term OR LOWER(c.last_name) LIKE :term OR LOWER(c.email) LIKE :term)', { term });
    }

    // orderBy DOIT utiliser le nom de propriété camelCase (mappé par
    // l'entité), pas le nom de colonne SQL.
    qb.orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { data: items, meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 } };
  }

  async findOne(organizationId: string, id: string) {
    return this.repo.findOne({
      where: { id, organizationId },
      relations: ['applications', 'applications.jobOpening'],
    });
  }

  async create(organizationId: string, input: CreateCandidateInput) {
    const entity = this.repo.create({
      organizationId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone ?? null,
      currentPosition: input.currentPosition ?? null,
      totalExperienceYears: input.totalExperienceYears ?? null,
      source: input.source ?? null,
      resumeUrl: input.resumeUrl ?? null,
      status: 'new',
    });
    return this.repo.save(entity);
  }

  async update(organizationId: string, id: string, input: UpdateCandidateInput) {
    const patch: QueryDeepPartialEntity<Candidate> = {};
    if (input.firstName) patch.firstName = input.firstName;
    if (input.lastName) patch.lastName = input.lastName;
    if (input.email) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.currentPosition !== undefined) patch.currentPosition = input.currentPosition;
    if (input.totalExperienceYears !== undefined) patch.totalExperienceYears = input.totalExperienceYears;
    if (input.source !== undefined) patch.source = input.source;
    if (input.resumeUrl !== undefined) patch.resumeUrl = input.resumeUrl;
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
