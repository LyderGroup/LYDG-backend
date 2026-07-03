import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseCategory } from '../entities/course-category.entity';

export interface CreateCourseCategoryInput {
  name: string;
  code: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
}

export type UpdateCourseCategoryInput = Partial<CreateCourseCategoryInput> & {
  isActive?: boolean;
};

@Injectable()
export class CourseCategoryService {
  constructor(
    @InjectRepository(CourseCategory) private readonly repo: Repository<CourseCategory>,
  ) {}

  async findAll(organizationId: string): Promise<CourseCategory[]> {
    return this.repo
      .createQueryBuilder('c')
      .where('c.organization_id = :orgId', { orgId: organizationId })
      .andWhere('c.deleted_at IS NULL')
      .orderBy('c.isActive', 'DESC')
      .addOrderBy('c.name', 'ASC')
      .getMany();
  }

  async findOne(organizationId: string, id: string): Promise<CourseCategory> {
    const cat = await this.repo.findOne({
      where: { id, organizationId },
    });
    if (!cat || cat.deletedAt) throw new NotFoundException('Catégorie introuvable');
    return cat;
  }

  async create(organizationId: string, input: CreateCourseCategoryInput): Promise<CourseCategory> {
    this.validate(input);
    const code = input.code.trim().toUpperCase();
    const conflict = await this.repo.findOne({
      where: { organizationId, code },
    });
    if (conflict && !conflict.deletedAt) {
      throw new BadRequestException(`Code "${code}" déjà utilisé`);
    }

    const entity = this.repo.create({
      organizationId,
      name: input.name.trim(),
      code,
      description: input.description?.trim() || null,
      color: input.color?.trim() || null,
      icon: input.icon?.trim() || null,
      isActive: true,
    });
    return this.repo.save(entity);
  }

  async update(organizationId: string, id: string, input: UpdateCourseCategoryInput): Promise<CourseCategory> {
    const cat = await this.findOne(organizationId, id);
    if (input.code) {
      const code = input.code.trim().toUpperCase();
      if (code !== cat.code) {
        const conflict = await this.repo.findOne({ where: { organizationId, code } });
        if (conflict && !conflict.deletedAt && conflict.id !== id) {
          throw new BadRequestException(`Code "${code}" déjà utilisé`);
        }
        cat.code = code;
      }
    }
    if (input.name !== undefined) cat.name = input.name.trim();
    if (input.description !== undefined) cat.description = input.description?.trim() || null;
    if (input.color !== undefined) cat.color = input.color?.trim() || null;
    if (input.icon !== undefined) cat.icon = input.icon?.trim() || null;
    if (input.isActive !== undefined) cat.isActive = input.isActive;
    return this.repo.save(cat);
  }

  async softDelete(organizationId: string, id: string): Promise<void> {
    const cat = await this.findOne(organizationId, id);
    await this.repo.update({ id: cat.id }, { deletedAt: new Date(), isActive: false } as any);
  }

  private validate(input: CreateCourseCategoryInput): void {
    if (!input.name?.trim()) throw new BadRequestException('Nom obligatoire');
    if (!input.code?.trim()) throw new BadRequestException('Code obligatoire');
    if (input.color && !/^#[0-9a-fA-F]{6}$/.test(input.color)) {
      throw new BadRequestException('Couleur invalide (format hex #RRGGBB)');
    }
  }
}
