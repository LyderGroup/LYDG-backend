import { Injectable, Logger } from '@nestjs/common';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';
import { getAuditableOptions } from './auditable.decorator';
import { getAuditContext } from './audit-context';

/**
 * Subscriber TypeORM qui capture automatiquement les CREATE / UPDATE / DELETE
 * sur toute entité décorée avec @Auditable.
 *
 * - Pour UPDATE : détecte les changements de `deleted_at` (soft-delete /
 *   restore) et reclasse l'action.
 * - Exclut systématiquement la table audit_logs elle-même (boucle infinie).
 */
@Injectable()
@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(AuditSubscriber.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {
    dataSource.subscribers.push(this);
  }

  async afterInsert(event: InsertEvent<any>): Promise<void> {
    const target = event.metadata.target;
    if (target === AuditLog) return;

    const meta = getAuditableOptions(target);
    if (!meta) return;

    const entity = event.entity;
    if (!entity?.id) return;

    await this.auditService.log({
      organizationId: this.resolveOrgId(entity),
      entityType: (target as any).name ?? event.metadata.name,
      entityId: entity.id,
      action: 'CREATE',
      afterState: this.sanitize(entity, meta.excludeFields),
      isLegallySignificant: meta.legallySignificant,
    });
  }

  async afterUpdate(event: UpdateEvent<any>): Promise<void> {
    const target = event.metadata.target;
    if (target === AuditLog) return;

    const meta = getAuditableOptions(target);
    if (!meta) return;

    const entity = event.entity as Record<string, any> | undefined;
    const databaseEntity = event.databaseEntity as Record<string, any> | undefined;
    if (!entity?.id) return;

    const before = this.sanitize(databaseEntity ?? {}, meta.excludeFields);
    const after = this.sanitize(entity, meta.excludeFields);
    const changedFields = this.diffFields(before, after);

    if (changedFields.length === 0) return; // rien à logger

    // Détection soft-delete / restore via changement de deleted_at
    let action: 'UPDATE' | 'SOFT_DELETE' | 'RESTORE' = 'UPDATE';
    if (
      changedFields.includes('deletedAt') ||
      changedFields.includes('deleted_at')
    ) {
      const wasDeleted = !!(before.deletedAt ?? before.deleted_at);
      const isDeleted = !!(after.deletedAt ?? after.deleted_at);
      if (!wasDeleted && isDeleted) action = 'SOFT_DELETE';
      else if (wasDeleted && !isDeleted) action = 'RESTORE';
    }

    await this.auditService.log({
      organizationId: this.resolveOrgId(entity),
      entityType: (target as any).name ?? event.metadata.name,
      entityId: entity.id,
      action,
      beforeState: before,
      afterState: after,
      changedFields,
      isLegallySignificant: meta.legallySignificant,
    });
  }

  async beforeRemove(event: RemoveEvent<any>): Promise<void> {
    const target = event.metadata.target;
    if (target === AuditLog) return;

    const meta = getAuditableOptions(target);
    if (!meta) return;

    const entity = event.entity as Record<string, any> | undefined;
    if (!entity?.id) return;

    // HARD DELETE : alerte si entité à valeur probante
    if (meta.legallySignificant) {
      const ctx = getAuditContext();
      this.logger.warn(
        `[AUDIT] HARD DELETE on legally significant entity ` +
          `${(target as any).name}:${entity.id} by user ${ctx?.actorUserId ?? 'unknown'}`,
      );
    }

    await this.auditService.log({
      organizationId: this.resolveOrgId(entity),
      entityType: (target as any).name ?? event.metadata.name,
      entityId: entity.id,
      action: 'HARD_DELETE',
      beforeState: this.sanitize(entity, meta.excludeFields),
      isLegallySignificant: meta.legallySignificant,
    });
  }

  // ──────────── Helpers ────────────

  private sanitize(
    entity: Record<string, any>,
    excludeFields: string[],
  ): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(entity)) {
      if (excludeFields.includes(k)) continue;
      // skip relations chargées (objets avec des id), ne garder que les FKs
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
        if ('id' in v) {
          out[`${k}Id`] = (v as any).id;
          continue;
        }
      }
      out[k] = v;
    }
    return out;
  }

  private diffFields(
    before: Record<string, any>,
    after: Record<string, any>,
  ): string[] {
    const changed: string[] = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
      const a = before[k];
      const b = after[k];
      if (a instanceof Date || b instanceof Date) {
        const aT = a instanceof Date ? a.getTime() : a;
        const bT = b instanceof Date ? b.getTime() : b;
        if (aT !== bT) changed.push(k);
      } else if (JSON.stringify(a) !== JSON.stringify(b)) {
        changed.push(k);
      }
    }
    return changed;
  }

  private resolveOrgId(entity: any): string | null {
    return (
      entity?.organizationId ??
      entity?.organization?.id ??
      getAuditContext()?.organizationId ??
      null
    );
  }
}
