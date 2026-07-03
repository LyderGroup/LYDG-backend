import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DataSource, ObjectLiteral, Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { getAuditableOptions } from './auditable.decorator';
import { getAuditContext } from './audit-context';

/**
 * Interface minimale qu'une entité soft-deletable doit exposer.
 * Toutes les entités auditables suivent ce contrat (colonnes ajoutées par
 * la migration audit_and_soft_delete.sql).
 */
export interface SoftDeletable extends ObjectLiteral {
  id: string;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  deletionReason?: string | null;
  organizationId?: string | null;
  isLocked?: boolean;
}

export interface SoftDeleteOptions {
  /** Motif de la suppression (recommandé pour les entités à valeur probante). */
  reason?: string;
  /**
   * Liste des références bloquantes à vérifier avant suppression.
   * Format : { table: 'projects', column: 'manager_id', label: 'projets gérés' }
   */
  checkReferences?: Array<{ table: string; column: string; label: string }>;
}

/**
 * Service utilitaire pour soft-delete uniformisé.
 *
 * Usage dans un service métier :
 *   constructor(private softDelete: SoftDeleteService) {}
 *   async deleteEmployee(orgId, id) {
 *     return this.softDelete.softDelete(this.employeesRepo, orgId, id, {
 *       reason: 'Demande RH',
 *       checkReferences: [
 *         { table: 'projects', column: 'manager_id', label: 'projets' },
 *       ],
 *     });
 *   }
 */
@Injectable()
export class SoftDeleteService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Soft-delete : marque deleted_at, deleted_by, deletion_reason et émet un
   * audit log SOFT_DELETE (via le subscriber TypeORM si entité @Auditable).
   *
   * @throws BadRequestException si entité introuvable
   * @throws ConflictException si entité verrouillée (is_locked) ou si des
   *   références bloquantes existent
   */
  async softDelete<T extends SoftDeletable>(
    repo: Repository<T>,
    organizationId: string,
    id: string,
    options: SoftDeleteOptions = {},
  ): Promise<void> {
    const entity = await repo.findOne({
      where: { id, organizationId } as any,
    });

    if (!entity) {
      throw new BadRequestException(`Entité ${id} introuvable`);
    }

    if (entity.deletedAt) {
      // déjà soft-deleted : idempotent, on sort sans erreur
      return;
    }

    if (entity.isLocked) {
      throw new ConflictException(
        `Cette entité est verrouillée (valeur probante) et ne peut pas être supprimée. ` +
        `Effectuez une contre-écriture si vous devez l'annuler.`,
      );
    }

    // Vérifier les références bloquantes (FK qui empêchent même un soft-delete logique)
    if (options.checkReferences?.length) {
      const blockers = await this.checkReferences(id, options.checkReferences);
      if (blockers.length > 0) {
        throw new ConflictException(
          `Suppression impossible : ${blockers.join(', ')}. ` +
          `Réassignez d'abord ces références.`,
        );
      }
    }

    const ctx = getAuditContext();
    await repo.update(
      { id, organizationId } as any,
      {
        deletedAt: new Date(),
        deletedBy: ctx?.actorUserId ?? null,
        deletionReason: options.reason ?? ctx?.reason ?? null,
      } as any,
    );

    // Si l'entité n'est pas @Auditable, on log quand même manuellement
    // (sinon le subscriber TypeORM s'en charge déjà).
    if (!getAuditableOptions(repo.metadata.target)) {
      await this.auditService.log({
        organizationId,
        entityType: (repo.metadata.target as any).name ?? repo.metadata.name,
        entityId: id,
        action: 'SOFT_DELETE',
        reason: options.reason,
      });
    }
  }

  /** Restauration d'une entité soft-deletée. */
  async restore<T extends SoftDeletable>(
    repo: Repository<T>,
    organizationId: string,
    id: string,
  ): Promise<void> {
    const entity = await repo.findOne({
      where: { id, organizationId } as any,
      withDeleted: true,
    } as any);

    if (!entity) {
      throw new BadRequestException(`Entité ${id} introuvable`);
    }

    if (!entity.deletedAt) {
      return; // déjà actif
    }

    await repo.update(
      { id, organizationId } as any,
      {
        deletedAt: null,
        deletedBy: null,
        deletionReason: null,
      } as any,
    );

    if (!getAuditableOptions(repo.metadata.target)) {
      await this.auditService.log({
        organizationId,
        entityType: (repo.metadata.target as any).name ?? repo.metadata.name,
        entityId: id,
        action: 'RESTORE',
      });
    }
  }

  /**
   * Hard-delete réservé aux purges après prescription légale (10 ans).
   * Toujours auditer avant suppression physique.
   */
  async hardDeleteAfterRetention<T extends SoftDeletable>(
    repo: Repository<T>,
    organizationId: string,
    id: string,
  ): Promise<void> {
    const entity = await repo.findOne({
      where: { id, organizationId } as any,
      withDeleted: true,
    } as any);
    if (!entity) return;

    // L'audit BEFORE est émis par le subscriber TypeORM (beforeRemove)
    await repo.remove(entity);
  }

  private async checkReferences(
    entityId: string,
    refs: Array<{ table: string; column: string; label: string }>,
  ): Promise<string[]> {
    const blockers: string[] = [];
    for (const ref of refs) {
      const result: Array<{ n: string }> = await this.dataSource.query(
        `SELECT COUNT(*)::text AS n FROM ${ref.table}
         WHERE ${ref.column} = $1
           AND (deleted_at IS NULL OR deleted_at IS NULL)`,
        [entityId],
      );
      const count = parseInt(result[0]?.n ?? '0', 10);
      if (count > 0) {
        blockers.push(`${count} ${ref.label}`);
      }
    }
    return blockers;
  }
}
