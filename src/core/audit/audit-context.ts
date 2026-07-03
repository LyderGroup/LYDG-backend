import { AsyncLocalStorage } from 'async_hooks';

/**
 * Contexte de requête propagé à travers les services pour enrichir
 * automatiquement les entrées d'audit (qui, IP, user-agent, request_id).
 *
 * Renseigné par l'AuditContextInterceptor à l'entrée de chaque requête HTTP,
 * lu par l'AuditService et l'AuditSubscriber TypeORM.
 */
export interface AuditContextData {
  actorUserId: string | null;
  organizationId: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string;
  /** Motif fourni par l'utilisateur (header X-Audit-Reason ou body.auditReason). */
  reason: string | null;
}

export const auditContext = new AsyncLocalStorage<AuditContextData>();

export function getAuditContext(): AuditContextData | null {
  return auditContext.getStore() ?? null;
}

/** Échappe au contexte (jobs cron, scripts) en fournissant un acteur "system". */
export function withSystemAuditContext<T>(
  data: Partial<AuditContextData>,
  fn: () => T,
): T {
  return auditContext.run(
    {
      actorUserId: null,
      organizationId: null,
      ip: null,
      userAgent: 'system',
      requestId: data.requestId ?? `system-${Date.now()}`,
      reason: data.reason ?? null,
      ...data,
    },
    fn,
  );
}
