import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction } from './audit-log.entity';
import { getAuditContext } from './audit-context';

/** Rétention par défaut : 10 ans (OHADA / AUDCG). */
const DEFAULT_RETENTION_YEARS = 10;

export interface LogAuditInput {
  organizationId?: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  beforeState?: Record<string, any> | null;
  afterState?: Record<string, any> | null;
  changedFields?: string[] | null;
  reason?: string | null;
  metadata?: Record<string, any> | null;
  isLegallySignificant?: boolean;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /**
   * Enregistre une entrée d'audit. Best-effort : ne lance jamais d'exception
   * pour ne pas bloquer le flux métier — un échec est loggé en warning.
   */
  async log(input: LogAuditInput): Promise<AuditLog | null> {
    try {
      const ctx = getAuditContext();
      const organizationId =
        input.organizationId ?? ctx?.organizationId ?? null;

      if (!organizationId) {
        this.logger.debug(
          `[AuditService] skip log : no organizationId resolved for ${input.entityType}:${input.entityId}`,
        );
        return null;
      }

      const retentionUntil = input.isLegallySignificant
        ? this.computeRetentionDate(DEFAULT_RETENTION_YEARS)
        : null;

      const entry = this.repo.create({
        organizationId,
        actorUserId: ctx?.actorUserId ?? null,
        actorIp: ctx?.ip ?? null,
        actorUserAgent: ctx?.userAgent ?? null,
        requestId: ctx?.requestId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        beforeState: input.beforeState ?? null,
        afterState: input.afterState ?? null,
        changedFields: input.changedFields ?? null,
        reason: input.reason ?? ctx?.reason ?? null,
        metadata: input.metadata ?? null,
        isLegallySignificant: input.isLegallySignificant ?? false,
        retentionUntil,
      });

      return await this.repo.save(entry);
    } catch (err) {
      this.logger.warn(
        `Audit log failed for ${input.entityType}:${input.entityId} (${input.action}): ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** Liste l'historique d'une entité (ordre antéchronologique). */
  async getEntityHistory(
    organizationId: string,
    entityType: string,
    entityId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ data: AuditLog[]; total: number }> {
    const [data, total] = await this.repo.findAndCount({
      where: { organizationId, entityType, entityId },
      order: { occurredAt: 'DESC' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
    return { data, total };
  }

  /** Liste les actions d'un utilisateur sur une période. */
  async getActorActivity(
    organizationId: string,
    actorUserId: string,
    options?: { from?: Date; to?: Date; limit?: number },
  ): Promise<AuditLog[]> {
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.organization_id = :orgId', { orgId: organizationId })
      .andWhere('a.actor_user_id = :userId', { userId: actorUserId })
      .orderBy('a.occurred_at', 'DESC')
      .take(options?.limit ?? 200);

    if (options?.from) {
      qb.andWhere('a.occurred_at >= :from', { from: options.from });
    }
    if (options?.to) {
      qb.andWhere('a.occurred_at <= :to', { to: options.to });
    }

    return qb.getMany();
  }

  private computeRetentionDate(years: number): Date {
    const d = new Date();
    d.setFullYear(d.getFullYear() + years);
    return d;
  }
}
