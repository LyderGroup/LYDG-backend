import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getAuditContext } from '../audit';

/**
 * Service d'émission d'événements HR en temps réel.
 *
 * Toutes les méthodes :
 *   - sont best-effort (catch + log warning, ne bloquent jamais le flux métier)
 *   - injectent `actorUserId` dans le payload (le client front l'utilise pour
 *     ignorer ses propres événements et éviter les doubles updates)
 *   - utilisent la gateway socket.io existante (lazy load pour éviter la
 *     dépendance circulaire au démarrage)
 *
 * Scopes disponibles (alignés avec HR_SCOPE_PERMISSIONS dans la gateway) :
 *   attendance, leave, journal, overtime, discipline, events, performance
 */
@Injectable()
export class HrRealtimeService implements OnModuleInit {
  private readonly logger = new Logger(HrRealtimeService.name);
  private gateway: any;

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit() {
    try {
      const { TaskCommentsGateway } = await import('../projects/task-comments.gateway.js');
      this.gateway = this.moduleRef.get(TaskCommentsGateway, { strict: false });
    } catch (e) {
      this.logger.error(`Impossible de charger la gateway HR : ${(e as Error).message}`);
    }
  }

  // ──────────── Attendance ────────────

  emitAttendanceCheckIn(input: {
    organizationId: string;
    attendanceId: string;
    employeeId: string;
    employeeName?: string;
    checkInTime: string;
    status: string;
    isLate: boolean;
    userId?: string | null;
  }): void {
    this.emitOrg(input.organizationId, 'attendance', 'attendance.check_in', input);
    if (input.userId) {
      this.emitUser(input.userId, 'attendance.check_in', input);
    }
  }

  emitAttendanceCheckOut(input: {
    organizationId: string;
    attendanceId: string;
    employeeId: string;
    employeeName?: string;
    checkOutTime: string;
    workedHours?: number;
    userId?: string | null;
  }): void {
    this.emitOrg(input.organizationId, 'attendance', 'attendance.check_out', input);
    if (input.userId) {
      this.emitUser(input.userId, 'attendance.check_out', input);
    }
  }

  // ──────────── Leave requests ────────────

  emitLeaveRequestCreated(input: {
    organizationId: string;
    requestId: string;
    employeeId: string;
    employeeName?: string;
    startDate: string;
    endDate: string;
    leaveType?: string;
    managerUserId?: string | null;
  }): void {
    this.emitOrg(input.organizationId, 'leave', 'leave_request.created', input);
    // Notif directe au manager s'il y en a un
    if (input.managerUserId) {
      this.emitUser(input.managerUserId, 'leave_request.created', input);
    }
  }

  emitLeaveRequestStatusChanged(input: {
    organizationId: string;
    requestId: string;
    employeeId: string;
    employeeUserId?: string | null;
    newStatus: string;
    previousStatus?: string;
    decidedBy?: string | null;
  }): void {
    this.emitOrg(input.organizationId, 'leave', 'leave_request.status_changed', input);
    if (input.employeeUserId) {
      this.emitUser(input.employeeUserId, 'leave_request.status_changed', input);
    }
  }

  // ──────────── Daily journals ────────────

  emitJournalSubmitted(input: {
    organizationId: string;
    journalId: string;
    employeeId: string;
    journalDate: string;
    userId?: string | null;
  }): void {
    this.emitOrg(input.organizationId, 'journal', 'journal.submitted', input);
  }

  emitJournalReviewed(input: {
    organizationId: string;
    journalId: string;
    employeeId: string;
    employeeUserId?: string | null;
    feedback?: string | null;
  }): void {
    this.emitOrg(input.organizationId, 'journal', 'journal.reviewed', input);
    if (input.employeeUserId) {
      this.emitUser(input.employeeUserId, 'journal.reviewed', input);
    }
  }

  // ──────────── Discipline / sanctions ────────────

  emitSanctionApplied(input: {
    organizationId: string;
    sanctionId: string;
    employeeId: string;
    employeeUserId?: string | null;
    sanctionType: string;
    level: number;
  }): void {
    this.emitOrg(input.organizationId, 'discipline', 'sanction.applied', input);
    if (input.employeeUserId) {
      this.emitUser(input.employeeUserId, 'sanction.applied', input);
    }
  }

  emitSanctionThresholdApproaching(input: {
    organizationId: string;
    employeeId: string;
    employeeUserId?: string | null;
    current: number;
    threshold: number;
    scope: string;
    nextStep: string;
  }): void {
    this.emitOrg(input.organizationId, 'discipline', 'sanction.threshold_approaching', input);
    if (input.employeeUserId) {
      this.emitUser(input.employeeUserId, 'sanction.threshold_approaching', input);
    }
  }

  // ──────────── Vie interne ────────────

  emitEventPublished(input: {
    organizationId: string;
    eventId: string;
    title: string;
    eventType: string;
    startDate: string | Date;
    isCompanyWide?: boolean;
  }): void {
    this.emitOrg(input.organizationId, 'events', 'event.published', input);
  }

  emitEventCancelled(input: {
    organizationId: string;
    eventId: string;
  }): void {
    this.emitOrg(input.organizationId, 'events', 'event.cancelled', input);
  }

  // ──────────── Performance ────────────

  emitPerformanceReviewChanged(input: {
    organizationId: string;
    reviewId: string;
    employeeId: string;
    action: 'created' | 'updated' | 'completed';
  }): void {
    this.emitOrg(input.organizationId, 'performance', `performance_review.${input.action}`, input);
  }

  // ──────────── Helpers internes ────────────

  /** Émet un événement vers la room org:scope, en injectant actorUserId. */
  private emitOrg(organizationId: string, scope: string, event: string, payload: any): void {
    if (!this.gateway) return;
    try {
      this.gateway.emitToHrRoom({
        organizationId,
        scope,
        event,
        payload: this.enrich(payload),
      });
    } catch (err) {
      this.logger.warn(`emitOrg(${scope}/${event}) failed: ${(err as Error).message}`);
    }
  }

  /** Émet un événement vers la room personnelle d'un utilisateur. */
  private emitUser(userId: string, event: string, payload: any): void {
    if (!this.gateway) return;
    try {
      this.gateway.emitToUserHr({
        userId,
        event,
        payload: this.enrich(payload),
      });
    } catch (err) {
      this.logger.warn(`emitUser(${event}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * Enrichit le payload avec :
   *   - actorUserId : utilisé par le front pour ignorer ses propres événements
   *   - emittedAt : horodatage serveur (resync, ordering)
   *   - requestId : trace cross-system avec les audit logs
   */
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
