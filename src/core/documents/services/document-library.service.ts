import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DocumentLibrary } from '../entities/document-library.entity';

export interface CreateLibraryInput {
  name: string;
  code: string;
  description?: string | null;
  basePath?: string | null;
  isDefault?: boolean;
}

export type UpdateLibraryInput = Partial<CreateLibraryInput> & {
  isActive?: boolean;
};

@Injectable()
export class DocumentLibraryService {
  constructor(
    @InjectRepository(DocumentLibrary) private readonly repo: Repository<DocumentLibrary>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(organizationId: string): Promise<DocumentLibrary[]> {
    return this.repo
      .createQueryBuilder('l')
      .where('l.organization_id = :orgId', { orgId: organizationId })
      .andWhere('l.deleted_at IS NULL')
      .orderBy('l.isDefault', 'DESC')
      .addOrderBy('l.name', 'ASC')
      .getMany();
  }

  async findOne(organizationId: string, id: string): Promise<DocumentLibrary> {
    const lib = await this.repo.findOne({ where: { id, organizationId } });
    if (!lib || lib.deletedAt) throw new NotFoundException('Bibliothèque introuvable');
    return lib;
  }

  async create(organizationId: string, actorId: string | null, input: CreateLibraryInput): Promise<DocumentLibrary> {
    this.validate(input);
    const code = input.code.trim().toUpperCase();

    return this.dataSource.transaction(async (em) => {
      const conflict = await em.getRepository(DocumentLibrary).findOne({
        where: { organizationId, code },
      });
      if (conflict && !conflict.deletedAt) {
        throw new BadRequestException(`Code "${code}" déjà utilisé`);
      }

      // Si on demande à mettre cette bibliothèque par défaut, on retire le
      // flag des autres pour garantir un seul "défaut" par tenant.
      if (input.isDefault) {
        await em
          .getRepository(DocumentLibrary)
          .update({ organizationId, isDefault: true }, { isDefault: false });
      }

      const lib = em.getRepository(DocumentLibrary).create({
        organizationId,
        name: input.name.trim(),
        code,
        description: input.description?.trim() || null,
        basePath: input.basePath?.trim() || null,
        isDefault: input.isDefault ?? false,
        isActive: true,
        createdBy: actorId,
        updatedBy: actorId,
      });
      return em.getRepository(DocumentLibrary).save(lib);
    });
  }

  async update(organizationId: string, id: string, actorId: string | null, input: UpdateLibraryInput): Promise<DocumentLibrary> {
    return this.dataSource.transaction(async (em) => {
      const lib = await em.getRepository(DocumentLibrary).findOne({
        where: { id, organizationId },
      });
      if (!lib || lib.deletedAt) throw new NotFoundException('Bibliothèque introuvable');

      if (input.code) {
        const code = input.code.trim().toUpperCase();
        if (code !== lib.code) {
          const conflict = await em.getRepository(DocumentLibrary).findOne({
            where: { organizationId, code },
          });
          if (conflict && !conflict.deletedAt && conflict.id !== id) {
            throw new BadRequestException(`Code "${code}" déjà utilisé`);
          }
          lib.code = code;
        }
      }
      if (input.name !== undefined) lib.name = input.name.trim();
      if (input.description !== undefined) lib.description = input.description?.trim() || null;
      if (input.basePath !== undefined) lib.basePath = input.basePath?.trim() || null;
      if (input.isActive !== undefined) lib.isActive = input.isActive;

      if (input.isDefault === true && !lib.isDefault) {
        await em
          .getRepository(DocumentLibrary)
          .update({ organizationId, isDefault: true }, { isDefault: false });
        lib.isDefault = true;
      } else if (input.isDefault === false) {
        lib.isDefault = false;
      }

      lib.updatedBy = actorId;
      return em.getRepository(DocumentLibrary).save(lib);
    });
  }

  async softDelete(organizationId: string, id: string, actorId: string | null): Promise<void> {
    const lib = await this.findOne(organizationId, id);
    if (lib.isDefault) {
      throw new BadRequestException("Impossible de supprimer la bibliothèque par défaut");
    }
    await this.repo.update(
      { id: lib.id },
      { deletedAt: new Date(), isActive: false, updatedBy: actorId } as any,
    );
  }

  private validate(input: CreateLibraryInput): void {
    if (!input.name?.trim()) throw new BadRequestException('Nom obligatoire');
    if (!input.code?.trim()) throw new BadRequestException('Code obligatoire');
  }
}
