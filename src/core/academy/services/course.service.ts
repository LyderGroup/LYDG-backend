import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course, CourseStatus } from '../entities/course.entity';

export interface CreateCourseInput {
  categoryId?: string | null;
  code: string;
  title: string;
  description?: string | null;
  language?: string;
  difficultyLevel?: string | null;
  durationHours?: number | null;
  ownerId?: string | null;
}

export type UpdateCourseInput = Partial<CreateCourseInput>;

export interface ListCoursesOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: CourseStatus;
  categoryId?: string;
}

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(Course) private readonly repo: Repository<Course>,
  ) {}

  async findPage(organizationId: string, options: ListCoursesOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 25;

    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.category', 'category')
      .leftJoinAndSelect('c.owner', 'owner')
      .where('c.organization_id = :orgId', { orgId: organizationId })
      .andWhere('c.deleted_at IS NULL');

    if (options.status) qb.andWhere('c.status = :status', { status: options.status });
    if (options.categoryId) qb.andWhere('c.category_id = :cid', { cid: options.categoryId });

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(c.code) LIKE :term OR LOWER(c.title) LIKE :term OR LOWER(COALESCE(c.description, \'\')) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('c.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items,
      meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 },
    };
  }

  async findOne(organizationId: string, id: string): Promise<Course> {
    const course = await this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.category', 'category')
      .leftJoinAndSelect('c.owner', 'owner')
      .where('c.id = :id', { id })
      .andWhere('c.organization_id = :orgId', { orgId: organizationId })
      .andWhere('c.deleted_at IS NULL')
      .getOne();
    if (!course) throw new NotFoundException('Cours introuvable');
    return course;
  }

  async create(organizationId: string, actorId: string | null, input: CreateCourseInput): Promise<Course> {
    this.validate(input);
    const code = input.code.trim().toUpperCase();
    const conflict = await this.repo.findOne({ where: { organizationId, code } });
    if (conflict && !conflict.deletedAt) {
      throw new BadRequestException(`Code "${code}" déjà utilisé`);
    }

    const course = this.repo.create({
      organizationId,
      categoryId: input.categoryId ?? null,
      code,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      language: input.language ?? 'fr',
      difficultyLevel: input.difficultyLevel ?? null,
      durationHours: input.durationHours ?? null,
      status: 'draft',
      ownerId: input.ownerId ?? actorId,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return this.repo.save(course);
  }

  async update(organizationId: string, id: string, actorId: string | null, input: UpdateCourseInput): Promise<Course> {
    const course = await this.findOne(organizationId, id);

    if (input.code) {
      const code = input.code.trim().toUpperCase();
      if (code !== course.code) {
        const conflict = await this.repo.findOne({ where: { organizationId, code } });
        if (conflict && !conflict.deletedAt && conflict.id !== id) {
          throw new BadRequestException(`Code "${code}" déjà utilisé`);
        }
        course.code = code;
      }
    }
    if (input.categoryId !== undefined) course.categoryId = input.categoryId;
    if (input.title !== undefined) course.title = input.title.trim();
    if (input.description !== undefined) course.description = input.description?.trim() || null;
    if (input.language) course.language = input.language;
    if (input.difficultyLevel !== undefined) course.difficultyLevel = input.difficultyLevel;
    if (input.durationHours !== undefined) course.durationHours = input.durationHours;
    if (input.ownerId !== undefined) course.ownerId = input.ownerId;
    course.updatedBy = actorId;
    return this.repo.save(course);
  }

  async publish(organizationId: string, id: string, actorId: string | null): Promise<Course> {
    const course = await this.findOne(organizationId, id);
    if (course.status === 'published') return course;
    if (course.status === 'archived') {
      throw new ForbiddenException('Un cours archivé doit être réactivé d\'abord');
    }
    await this.repo.update({ id }, { status: 'published', updatedBy: actorId } as any);
    return this.findOne(organizationId, id);
  }

  async archive(organizationId: string, id: string, actorId: string | null): Promise<Course> {
    const course = await this.findOne(organizationId, id);
    if (course.status === 'archived') return course;
    await this.repo.update({ id }, { status: 'archived', updatedBy: actorId } as any);
    return this.findOne(organizationId, id);
  }

  async unarchive(organizationId: string, id: string, actorId: string | null): Promise<Course> {
    const course = await this.findOne(organizationId, id);
    if (course.status !== 'archived') return course;
    await this.repo.update({ id }, { status: 'draft', updatedBy: actorId } as any);
    return this.findOne(organizationId, id);
  }

  async softDelete(organizationId: string, id: string, actorId: string | null): Promise<void> {
    const course = await this.findOne(organizationId, id);
    if (course.status === 'published') {
      throw new ForbiddenException('Archivez le cours avant de le supprimer');
    }
    await this.repo.update(
      { id },
      { deletedAt: new Date(), updatedBy: actorId } as any,
    );
  }

  private validate(input: CreateCourseInput): void {
    if (!input.code?.trim()) throw new BadRequestException('Code obligatoire');
    if (!input.title?.trim()) throw new BadRequestException('Titre obligatoire');
    if (input.durationHours !== undefined && input.durationHours !== null) {
      if (!Number.isFinite(input.durationHours) || input.durationHours < 0) {
        throw new BadRequestException('Durée invalide');
      }
    }
  }
}
