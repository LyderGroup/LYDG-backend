import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Folder } from '../entities/folder.entity';
import { DocumentLibrary } from '../entities/document-library.entity';
import { CONFIDENTIALITY_LEVELS, ConfidentialityLevel } from '../documents.permissions';

export interface CreateFolderInput {
  libraryId: string;
  parentFolderId?: string | null;
  name: string;
  description?: string | null;
  confidentialityLevel?: ConfidentialityLevel;
  isPublic?: boolean;
}

export type UpdateFolderInput = Partial<Omit<CreateFolderInput, 'libraryId'>>;

export interface ListFoldersOptions {
  libraryId?: string;
  parentFolderId?: string | null; // null = racines
  search?: string;
}

@Injectable()
export class FolderService {
  constructor(
    @InjectRepository(Folder) private readonly repo: Repository<Folder>,
    @InjectRepository(DocumentLibrary) private readonly libraries: Repository<DocumentLibrary>,
  ) {}

  async findChildren(organizationId: string, options: ListFoldersOptions): Promise<Folder[]> {
    const qb = this.repo
      .createQueryBuilder('f')
      .where('f.organization_id = :orgId', { orgId: organizationId })
      .andWhere('f.deleted_at IS NULL');

    if (options.libraryId) qb.andWhere('f.library_id = :lid', { lid: options.libraryId });

    if (options.parentFolderId === null) {
      qb.andWhere('f.parent_folder_id IS NULL');
    } else if (options.parentFolderId) {
      qb.andWhere('f.parent_folder_id = :pid', { pid: options.parentFolderId });
    }

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere('LOWER(f.name) LIKE :term', { term });
    }

    qb.orderBy('f.name', 'ASC');
    return qb.getMany();
  }

  async findOne(organizationId: string, id: string): Promise<Folder> {
    const folder = await this.repo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.library', 'library')
      .leftJoinAndSelect('f.parentFolder', 'parentFolder')
      .leftJoinAndSelect('f.owner', 'owner')
      .where('f.id = :id', { id })
      .andWhere('f.organization_id = :orgId', { orgId: organizationId })
      .andWhere('f.deleted_at IS NULL')
      .getOne();
    if (!folder) throw new NotFoundException('Dossier introuvable');
    return folder;
  }

  async create(organizationId: string, actorId: string | null, input: CreateFolderInput): Promise<Folder> {
    if (!input.name?.trim()) throw new BadRequestException('Nom du dossier obligatoire');
    if (input.confidentialityLevel && !CONFIDENTIALITY_LEVELS.includes(input.confidentialityLevel)) {
      throw new BadRequestException('Niveau de confidentialité invalide');
    }

    // Vérifier la bibliothèque
    const library = await this.libraries.findOne({ where: { id: input.libraryId, organizationId } });
    if (!library || library.deletedAt) throw new BadRequestException('Bibliothèque introuvable');

    // Vérifier le parent (même bibliothèque, même tenant)
    if (input.parentFolderId) {
      const parent = await this.repo.findOne({ where: { id: input.parentFolderId, organizationId } });
      if (!parent || parent.deletedAt) throw new BadRequestException('Dossier parent introuvable');
      if (parent.libraryId !== input.libraryId) {
        throw new BadRequestException('Le parent doit appartenir à la même bibliothèque');
      }
    }

    // Anti-doublon sur (library, parent, name)
    const conflict = await this.repo
      .createQueryBuilder('f')
      .where('f.organization_id = :orgId', { orgId: organizationId })
      .andWhere('f.library_id = :lid', { lid: input.libraryId })
      .andWhere(
        input.parentFolderId
          ? 'f.parent_folder_id = :pid'
          : 'f.parent_folder_id IS NULL',
        input.parentFolderId ? { pid: input.parentFolderId } : {},
      )
      .andWhere('LOWER(f.name) = LOWER(:name)', { name: input.name.trim() })
      .andWhere('f.deleted_at IS NULL')
      .getOne();
    if (conflict) {
      throw new BadRequestException('Un dossier avec ce nom existe déjà dans cet emplacement');
    }

    const folder = this.repo.create({
      organizationId,
      libraryId: input.libraryId,
      parentFolderId: input.parentFolderId ?? null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      confidentialityLevel: input.confidentialityLevel ?? 'internal',
      isPublic: input.isPublic ?? false,
      ownerId: actorId,
      createdBy: actorId,
      updatedBy: actorId,
    });
    const saved = await this.repo.save(folder);
    // Le path est calculé par trigger SQL — on relit pour le récupérer
    return this.findOne(organizationId, saved.id);
  }

  async update(organizationId: string, id: string, actorId: string | null, input: UpdateFolderInput): Promise<Folder> {
    const folder = await this.findOne(organizationId, id);

    if (input.parentFolderId !== undefined) {
      if (input.parentFolderId === id) {
        throw new BadRequestException('Un dossier ne peut pas être son propre parent');
      }
      if (input.parentFolderId) {
        const parent = await this.repo.findOne({
          where: { id: input.parentFolderId, organizationId },
        });
        if (!parent || parent.deletedAt) throw new BadRequestException('Dossier parent introuvable');
        if (parent.libraryId !== folder.libraryId) {
          throw new BadRequestException('Le parent doit appartenir à la même bibliothèque');
        }
        // Anti-cycle : empêcher de déplacer dans un descendant
        if (await this.isDescendantOf(input.parentFolderId, id)) {
          throw new BadRequestException('Impossible de déplacer un dossier dans son propre sous-arbre');
        }
      }
      folder.parentFolderId = input.parentFolderId;
    }
    if (input.name !== undefined) folder.name = input.name.trim();
    if (input.description !== undefined) folder.description = input.description?.trim() || null;
    if (input.confidentialityLevel !== undefined) {
      if (!CONFIDENTIALITY_LEVELS.includes(input.confidentialityLevel)) {
        throw new BadRequestException('Niveau de confidentialité invalide');
      }
      folder.confidentialityLevel = input.confidentialityLevel;
    }
    if (input.isPublic !== undefined) folder.isPublic = input.isPublic;
    folder.updatedBy = actorId;

    await this.repo.save(folder);
    return this.findOne(organizationId, id);
  }

  async softDelete(organizationId: string, id: string, actorId: string | null): Promise<void> {
    const folder = await this.findOne(organizationId, id);
    // Vérifier qu'il n'y a pas de sous-dossiers actifs
    const childCount = await this.repo
      .createQueryBuilder('f')
      .where('f.parent_folder_id = :pid', { pid: folder.id })
      .andWhere('f.deleted_at IS NULL')
      .getCount();
    if (childCount > 0) {
      throw new BadRequestException(`Ce dossier contient ${childCount} sous-dossier(s). Supprimez-les d'abord.`);
    }
    await this.repo.update(
      { id: folder.id },
      { deletedAt: new Date(), updatedBy: actorId } as any,
    );
  }

  /** Retourne le chemin (breadcrumb) d'un dossier vers la racine. */
  async breadcrumb(organizationId: string, id: string): Promise<Array<{ id: string; name: string }>> {
    const trail: Array<{ id: string; name: string }> = [];
    let current: Folder | null = await this.findOne(organizationId, id);
    let safety = 0;
    while (current && safety < 50) {
      trail.unshift({ id: current.id, name: current.name });
      if (!current.parentFolderId) break;
      const parent = await this.repo.findOne({
        where: { id: current.parentFolderId, organizationId },
      });
      if (!parent || parent.deletedAt) break;
      current = parent;
      safety++;
    }
    return trail;
  }

  private async isDescendantOf(candidateAncestorId: string, folderId: string): Promise<boolean> {
    const result: Array<{ exists: boolean }> = await this.repo.query(
      `WITH RECURSIVE descendants AS (
        SELECT id, parent_folder_id FROM module_f_documents.folders WHERE id = $1
        UNION ALL
        SELECT f.id, f.parent_folder_id
          FROM module_f_documents.folders f
          INNER JOIN descendants d ON f.parent_folder_id = d.id
      )
      SELECT EXISTS (SELECT 1 FROM descendants WHERE id = $2) AS exists`,
      [folderId, candidateAncestorId],
    );
    return !!result?.[0]?.exists;
  }
}
