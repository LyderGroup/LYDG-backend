import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getAuditContext } from '../audit';

/**
 * Service d'émission d'événements Projets en temps réel.
 *
 * Symétrique de `HrRealtimeService`. Toutes les méthodes :
 *   - sont best-effort (catch + log warning, ne bloquent pas le flux métier)
 *   - injectent `actorUserId` dans le payload (le front l'utilise pour
 *     dédupliquer ses propres événements)
 *   - utilisent la gateway socket.io existante (lazy load pour éviter
 *     la dépendance circulaire au démarrage)
 *
 * Scopes (alignés avec PROJECTS_SCOPE_PERMISSIONS de la gateway) :
 *   tasks, validations, members, dependencies, workflows
 *
 * En plus, deux rooms ciblées :
 *   - `project:${projectId}` pour les events d'un projet spécifique
 *   - `user:${userId}:projects` pour les events personnels (assignation, etc.)
 */
@Injectable()
export class ProjectsRealtimeService implements OnModuleInit {
  private readonly logger = new Logger(ProjectsRealtimeService.name);
  private gateway: any;

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit() {
    try {
      const { TaskCommentsGateway } = await import('./task-comments.gateway.js');
      this.gateway = this.moduleRef.get(TaskCommentsGateway, { strict: false });
    } catch (e) {
      this.logger.error(`Impossible de charger la gateway Projets : ${(e as Error).message}`);
    }
  }

  // ─── Tasks ─────────────────────────────────────────────────────────

  emitTaskCreated(input: {
    organizationId: string;
    projectId: string;
    taskId: string;
    title: string;
    status: string;
    assigneeId?: string | null;
  }): void {
    this.emitOrg(input.organizationId, 'tasks', 'task.created', input);
    this.emitProject(input.projectId, 'task.created', input);
    if (input.assigneeId) {
      this.emitUser(input.assigneeId, 'task.created', input);
    }
  }

  emitTaskUpdated(input: {
    organizationId: string;
    projectId: string;
    taskId: string;
    title?: string;
    status?: string;
    progress?: number;
    changedFields?: string[];
  }): void {
    this.emitOrg(input.organizationId, 'tasks', 'task.updated', input);
    this.emitProject(input.projectId, 'task.updated', input);
  }

  emitTaskDeleted(input: {
    organizationId: string;
    projectId: string;
    taskId: string;
  }): void {
    this.emitOrg(input.organizationId, 'tasks', 'task.deleted', input);
    this.emitProject(input.projectId, 'task.deleted', input);
  }

  emitTaskAssigned(input: {
    organizationId: string;
    projectId: string;
    taskId: string;
    assigneeId: string;
    previousAssigneeId?: string | null;
  }): void {
    this.emitOrg(input.organizationId, 'tasks', 'task.assigned', input);
    this.emitProject(input.projectId, 'task.assigned', input);
    this.emitUser(input.assigneeId, 'task.assigned', input);
    if (input.previousAssigneeId && input.previousAssigneeId !== input.assigneeId) {
      this.emitUser(input.previousAssigneeId, 'task.unassigned', input);
    }
  }

  // ─── Validations workflow ──────────────────────────────────────────

  emitValidationRequested(input: {
    organizationId: string;
    projectId: string;
    taskId: string;
    requestId: string;
    stepId: string;
    requesterId: string;
    validatorIds?: string[];
  }): void {
    this.emitOrg(input.organizationId, 'validations', 'validation.requested', input);
    this.emitProject(input.projectId, 'validation.requested', input);
    for (const uid of input.validatorIds ?? []) {
      this.emitUser(uid, 'validation.requested', input);
    }
  }

  emitValidationApproved(input: {
    organizationId: string;
    projectId: string;
    taskId: string;
    requestId: string;
    stepId: string;
    requesterId?: string | null;
    assigneeId?: string | null;
  }): void {
    this.emitOrg(input.organizationId, 'validations', 'validation.approved', input);
    this.emitProject(input.projectId, 'validation.approved', input);
    if (input.requesterId) this.emitUser(input.requesterId, 'validation.approved', input);
    if (input.assigneeId && input.assigneeId !== input.requesterId) {
      this.emitUser(input.assigneeId, 'validation.approved', input);
    }
  }

  emitValidationRejected(input: {
    organizationId: string;
    projectId: string;
    taskId: string;
    requestId: string;
    stepId: string;
    reason: string;
    requesterId?: string | null;
    assigneeId?: string | null;
  }): void {
    this.emitOrg(input.organizationId, 'validations', 'validation.rejected', input);
    this.emitProject(input.projectId, 'validation.rejected', input);
    if (input.requesterId) this.emitUser(input.requesterId, 'validation.rejected', input);
    if (input.assigneeId && input.assigneeId !== input.requesterId) {
      this.emitUser(input.assigneeId, 'validation.rejected', input);
    }
  }

  // ─── Membres projet ────────────────────────────────────────────────

  emitMemberAdded(input: {
    organizationId: string;
    projectId: string;
    userId: string;
    roleInProject?: string;
  }): void {
    this.emitOrg(input.organizationId, 'members', 'member.added', input);
    this.emitProject(input.projectId, 'member.added', input);
    this.emitUser(input.userId, 'member.added', input);
  }

  emitMemberRemoved(input: {
    organizationId: string;
    projectId: string;
    userId: string;
  }): void {
    this.emitOrg(input.organizationId, 'members', 'member.removed', input);
    this.emitProject(input.projectId, 'member.removed', input);
    this.emitUser(input.userId, 'member.removed', input);
  }

  // ─── Dependencies ──────────────────────────────────────────────────

  emitDependencyChanged(input: {
    organizationId: string;
    projectId: string;
    taskId: string;
    dependsOnTaskId: string;
    action: 'added' | 'removed';
  }): void {
    this.emitOrg(input.organizationId, 'dependencies', `dependency.${input.action}`, input);
    this.emitProject(input.projectId, `dependency.${input.action}`, input);
  }

  // ─── Project (top-level) ───────────────────────────────────────────

  emitProjectChanged(input: {
    organizationId: string;
    projectId: string;
    action: 'created' | 'updated' | 'deleted';
    name?: string;
    progress?: number;
  }): void {
    this.emitOrg(input.organizationId, 'tasks', `project.${input.action}`, input);
    this.emitProject(input.projectId, `project.${input.action}`, input);
  }

  // ─── Helpers internes ──────────────────────────────────────────────

  private emitOrg(organizationId: string, scope: string, event: string, payload: any): void {
    if (!this.gateway) return;
    try {
      this.gateway.emitToProjectsRoom({
        organizationId,
        scope,
        event,
        payload: this.enrich(payload),
      });
    } catch (err) {
      this.logger.warn(`emitOrg(${scope}/${event}) failed: ${(err as Error).message}`);
    }
  }

  private emitProject(projectId: string, event: string, payload: any): void {
    if (!this.gateway) return;
    try {
      this.gateway.emitToProjectRoom({
        projectId,
        event,
        payload: this.enrich(payload),
      });
    } catch (err) {
      this.logger.warn(`emitProject(${event}) failed: ${(err as Error).message}`);
    }
  }

  private emitUser(userId: string, event: string, payload: any): void {
    if (!this.gateway) return;
    try {
      this.gateway.emitToUserProjects({
        userId,
        event,
        payload: this.enrich(payload),
      });
    } catch (err) {
      this.logger.warn(`emitUser(${event}) failed: ${(err as Error).message}`);
    }
  }

  /** Enrichit avec actorUserId (déduplication front), requestId, timestamp. */
  private enrich(payload: any): any {
    const ctx = getAuditContext();
    return {
      ...payload,
      actorUserId: ctx?.actorUserId ?? null,
      requestId: ctx?.requestId ?? null,
      emittedAt: new Date().toISOString(),
    };
  }
}
