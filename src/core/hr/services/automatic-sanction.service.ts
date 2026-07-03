import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, LessThanOrEqual } from 'typeorm';
import { EmployeeSanction, WarningType, SanctionStatus } from '../entities/employee-sanction.entity';
import { OfficeAttendance } from '../entities/office-attendance.entity';
import { Employee } from '../employee.entity';
import { User } from '../../users/user.entity';
import { InAppNotificationService } from '../../notifications/in-app-notification.service';
import { HrRealtimeService } from '../hr-realtime.service';

interface SanctionRule {
  level: number;
  type: string;
  warningType?: WarningType;
  reason: string;
  condition: {
    lateCount: number;
    period: 'week' | 'month' | 'year';
  };
  suspensionDays?: number;
}

const SANCTION_RULES: SanctionRule[] = [
  {
    level: 1,
    type: 'warning_letter',
    warningType: 'VERBAL',
    reason: 'Accumulation de 3 retards en une semaine',
    condition: { lateCount: 3, period: 'week' },
  },
  {
    level: 2,
    type: 'formal_warning',
    warningType: 'WRITTEN',
    reason: 'Accumulation de 4 retards en un mois',
    condition: { lateCount: 4, period: 'month' },
  },
  {
    level: 3,
    type: 'suspension',
    warningType: 'FINAL',
    reason: 'Accumulation de 3 avertissements formels en un an',
    condition: { lateCount: 3, period: 'year' },
    suspensionDays: 3,
  },
  {
    level: 4,
    type: 'termination',
    reason: 'Accumulation de 2 mises à pied en un an',
    condition: { lateCount: 2, period: 'year' },
  },
];

@Injectable()
export class AutomaticSanctionService {
  private readonly logger = new Logger(AutomaticSanctionService.name);

  constructor(
    @InjectRepository(EmployeeSanction)
    private readonly sanctionRepo: Repository<EmployeeSanction>,
    @InjectRepository(OfficeAttendance)
    private readonly attendanceRepo: Repository<OfficeAttendance>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly notificationService: InAppNotificationService,
    private readonly realtime: HrRealtimeService,
  ) { }

  async checkAndApplySanctions(organizationId: string): Promise<void> {
    this.logger.log('Checking automatic sanctions for organization: ' + organizationId);

    const employees = await this.employeeRepo.find({
      where: { organizationId, employmentStatus: 'active' },
    });

    for (const employee of employees) {
      await this.checkEmployeeSanctions(employee.id, organizationId);
    }
  }

  async checkEmployeeSanctions(employeeId: string, organizationId: string): Promise<EmployeeSanction | null> {
    // Check each rule
    for (const rule of SANCTION_RULES) {
      const shouldApply = await this.shouldApplySanction(employeeId, rule);
      if (shouldApply) {
        const existingSanction = await this.checkExistingSanction(employeeId, rule);
        if (!existingSanction) {
          return this.applySanction(employeeId, organizationId, rule);
        }
      }
    }
    return null;
  }

  private async shouldApplySanction(employeeId: string, rule: SanctionRule): Promise<boolean> {
    const now = new Date();
    let startDate: Date;
    let endDate = now;

    switch (rule.condition.period) {
      case 'week':
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startDate = new Date(now);
        startDate.setDate(diff);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    if (rule.type === 'warning_letter' || rule.type === 'formal_warning') {
      // Count late attendances
      const lateCount = await this.countLateAttendances(employeeId, startDate, endDate);
      return lateCount >= rule.condition.lateCount;
    }

    if (rule.type === 'suspension') {
      // Count formal warnings this year
      const warningCount = await this.countSanctionsByType(employeeId, 'formal_warning', startDate, endDate);
      return warningCount >= rule.condition.lateCount;
    }

    if (rule.type === 'termination') {
      // Count suspensions this year
      const suspensionCount = await this.countSanctionsByType(employeeId, 'suspension', startDate, endDate);
      return suspensionCount >= rule.condition.lateCount;
    }

    return false;
  }

  private async countLateAttendances(employeeId: string, startDate: Date, endDate: Date): Promise<number> {
    return this.attendanceRepo
      .createQueryBuilder('a')
      .where('a.employeeId = :employeeId', { employeeId })
      .andWhere('a.status = :status', { status: 'late' })
      .andWhere('a.attendanceDate >= :startDate', { startDate })
      .andWhere('a.attendanceDate <= :endDate', { endDate })
      .getCount();
  }

  private async countSanctionsByType(
    employeeId: string,
    type: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    return this.sanctionRepo
      .createQueryBuilder('s')
      .where('s.employeeId = :employeeId', { employeeId })
      .andWhere('s.type = :type', { type })
      .andWhere('s.status != :cancelled', { cancelled: 'cancelled' })
      .andWhere('s.sanctionDate >= :startDate', { startDate })
      .andWhere('s.sanctionDate <= :endDate', { endDate })
      .getCount();
  }

  private async checkExistingSanction(employeeId: string, rule: SanctionRule): Promise<boolean> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const existing = await this.sanctionRepo.findOne({
      where: {
        employeeId,
        type: rule.type,
        sanctionDate: today,
      },
    });

    return !!existing;
  }

  private async applySanction(
    employeeId: string,
    organizationId: string,
    rule: SanctionRule,
  ): Promise<EmployeeSanction> {
    this.logger.log(`Applying sanction ${rule.type} to employee ${employeeId}`);

    const sanction = this.sanctionRepo.create({
      employeeId,
      organizationId,
      sanctionTypeId: this.getSanctionTypeId(rule),
      level: rule.level,
      type: rule.type,
      warningType: rule.warningType || null,
      reason: rule.reason,
      description: `Sanction automatique générée par le système le ${new Date().toLocaleDateString('fr-FR')}`,
      faultDate: new Date(),
      faultDetails: rule.reason,
      sanctionDate: new Date(),
      status: 'active' as SanctionStatus,
      suspensionDays: (rule as any).suspensionDays || 0,
      suspensionStartDate: (rule as any).suspensionDays
        ? this.calculateSuspensionStart((rule as any).suspensionDays)
        : null,
      suspensionEndDate: (rule as any).suspensionDays
        ? this.calculateSuspensionEnd((rule as any).suspensionDays)
        : null,
    });

    const savedSanction = await this.sanctionRepo.save(sanction);

    // Notifs : employé + admins RH (en parallèle, best-effort).
    await Promise.all([
      this.sendSanctionNotificationToEmployee(employeeId, organizationId, rule, savedSanction.id),
      this.sendSanctionNotificationToAdmins(employeeId, organizationId, rule, savedSanction.id),
    ]);

    // Émission temps réel : compteurs discipline + listes des sanctions.
    try {
      const emp = await this.employeeRepo.findOne({
        where: { id: employeeId },
        select: ['userId'],
      });
      this.realtime.emitSanctionApplied({
        organizationId,
        sanctionId: savedSanction.id,
        employeeId,
        employeeUserId: emp?.userId ?? null,
        sanctionType: rule.type,
        level: rule.level,
      });
    } catch {
      // best-effort
    }

    return savedSanction;
  }

  private async sendSanctionNotificationToEmployee(
    employeeId: string,
    organizationId: string,
    rule: SanctionRule,
    sanctionId: string,
  ): Promise<void> {
    try {
      const employee = await this.employeeRepo.findOne({
        where: { id: employeeId },
        relations: ['user'],
      });

      if (!employee?.userId) {
        this.logger.warn(`No user found for employee ${employeeId}, skipping employee notification`);
        return;
      }

      const warningLabels: Record<string, string> = {
        warning_letter: 'Avertissement verbal',
        formal_warning: 'Avertissement formel',
        suspension: 'Mise à pied',
        termination: 'Licenciement',
      };

      const consequenceLabels: Record<string, string> = {
        warning_letter: 'Veuillez améliorer votre ponctualité.',
        formal_warning: 'Cet avertissement est inscrit à votre dossier.',
        suspension: `Vous êtes suspendu(e) pendant ${rule.suspensionDays || 3} jours.`,
        termination: 'Veuillez contacter les ressources humaines.',
      };

      await this.notificationService.create({
        userId: employee.userId,
        organizationId,
        type: 'sanction_applied',
        title: `⚠️ ${warningLabels[rule.type] || 'Sanction'} - Seuil de discipline atteint`,
        message: `${rule.reason}\n\n${consequenceLabels[rule.type] || ''}`,
        data: {
          sanctionId,
          sanctionType: rule.type,
          level: rule.level,
          warningType: rule.warningType,
        },
      });

      this.logger.log(`Sanction notification → employee ${employee.userId}, sanction ${sanctionId}`);
    } catch (error) {
      this.logger.error(`Failed to send sanction notification to employee: ${error}`);
    }
  }

  /**
   * Notifie les admins RH lorsqu'un seuil disciplinaire est dépassé pour un
   * employé. Permet à la RH de réagir vite (entretien, validation manuelle
   * de la mise à pied/licenciement, etc.).
   */
  private async sendSanctionNotificationToAdmins(
    employeeId: string,
    organizationId: string,
    rule: SanctionRule,
    sanctionId: string,
  ): Promise<void> {
    try {
      const adminIds = await this.findHrAdminUserIds(organizationId);
      if (adminIds.length === 0) return;

      const employee = await this.employeeRepo.findOne({
        where: { id: employeeId },
        relations: ['user'],
      });
      const empName = employee?.user
        ? `${employee.user.firstName ?? ''} ${employee.user.lastName ?? ''}`.trim()
        : 'Un employé';

      const sanctionLabels: Record<string, string> = {
        warning_letter: 'Avertissement verbal',
        formal_warning: 'Avertissement formel',
        suspension: 'Mise à pied',
        termination: 'Licenciement',
      };

      await this.notificationService.createMany(
        adminIds.map(uid => ({
          userId: uid,
          organizationId,
          type: 'sanction_admin_alert',
          title: `🚨 Sanction automatique : ${empName}`,
          message:
            `${sanctionLabels[rule.type] || rule.type} (niveau ${rule.level}) appliqué(e) à ${empName}.\n` +
            `Motif : ${rule.reason}`,
          data: {
            sanctionId,
            employeeId,
            employeeName: empName,
            sanctionType: rule.type,
            level: rule.level,
          },
        })),
      );

      this.logger.log(
        `Sanction admin alert → ${adminIds.length} admins, sanction ${sanctionId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send sanction notification to admins: ${error}`);
    }
  }

  /**
   * Notifications anticipatives : prévient l'employé (et la RH en cas de
   * paliers critiques) AVANT que le seuil soit atteint, pour qu'il puisse
   * encore se corriger.
   *
   * Paliers :
   *  - 2/3 retards semaine → notif employé "1 retard avant avertissement"
   *  - 3/4 retards mois → notif employé + admins
   *  - 2/3 avertissements année → notif employé + admins (risque mise à pied)
   *  - 1/2 mises à pied année → notif employé + admins (risque licenciement)
   *
   * Idempotent par jour : on stocke un marqueur dans le data des notifs déjà
   * envoyées pour éviter le spam si le compteur ne change pas.
   */
  async checkApproachingThresholds(
    employeeId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      const stats = await this.getEmployeeSanctionStats(employeeId);
      const employee = await this.employeeRepo.findOne({
        where: { id: employeeId },
        relations: ['user'],
      });
      if (!employee?.userId) return;

      const empName = employee.user
        ? `${employee.user.firstName ?? ''} ${employee.user.lastName ?? ''}`.trim()
        : 'Employé';

      const checks: Array<{
        current: number;
        threshold: number;
        scope: string;
        nextStep: string;
        alertAdmins: boolean;
      }> = [
        {
          current: stats.weeklyLateCount,
          threshold: 3,
          scope: 'cette semaine',
          nextStep: 'avertissement verbal',
          alertAdmins: false,
        },
        {
          current: stats.monthlyLateCount,
          threshold: 4,
          scope: 'ce mois',
          nextStep: 'avertissement formel',
          alertAdmins: true,
        },
        {
          current: stats.yearlyWarningCount,
          threshold: 3,
          scope: 'cette année',
          nextStep: 'mise à pied (3 jours)',
          alertAdmins: true,
        },
        {
          current: stats.yearlySuspensionCount,
          threshold: 2,
          scope: 'cette année',
          nextStep: 'licenciement',
          alertAdmins: true,
        },
      ];

      for (const c of checks) {
        // Anticipation : déclencher à threshold − 1 (ex : 2/3, 3/4)
        if (c.current === c.threshold - 1) {
          // Notif employé
          await this.notificationService.create({
            userId: employee.userId,
            organizationId,
            type: 'sanction_threshold_approaching',
            title: `⚠️ Attention — seuil de discipline proche`,
            message:
              `Vous êtes à ${c.current}/${c.threshold} ${c.scope}. ` +
              `Un incident supplémentaire entraînera : ${c.nextStep}.`,
            data: {
              employeeId,
              current: c.current,
              threshold: c.threshold,
              scope: c.scope,
              nextStep: c.nextStep,
            },
          });

          // Notif admins pour les paliers critiques
          if (c.alertAdmins) {
            const adminIds = await this.findHrAdminUserIds(organizationId);
            if (adminIds.length > 0) {
              await this.notificationService.createMany(
                adminIds.map(uid => ({
                  userId: uid,
                  organizationId,
                  type: 'sanction_admin_alert' as const,
                  title: `Discipline : ${empName} approche le seuil critique`,
                  message:
                    `${empName} est à ${c.current}/${c.threshold} ${c.scope}. ` +
                    `Prochaine étape automatique : ${c.nextStep}.`,
                  data: {
                    employeeId,
                    employeeName: empName,
                    current: c.current,
                    threshold: c.threshold,
                    scope: c.scope,
                    nextStep: c.nextStep,
                  },
                })),
              );
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `checkApproachingThresholds failed for ${employeeId}: ${(err as Error).message}`,
      );
    }
  }

  /** Trouve les userIds RH d'une organisation (notifs admins). */
  private async findHrAdminUserIds(organizationId: string): Promise<string[]> {
    const rows: Array<{ user_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT ur.user_id
       FROM core.user_roles ur
       INNER JOIN core.roles r ON r.id = ur.role_id
       INNER JOIN core.role_permissions rp ON rp.role_id = r.id
       INNER JOIN core.permissions p ON p.id = rp.permission_id
       WHERE ur.is_active = true
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
         AND r.is_active = true
         AND (r.organization_id = $1 OR r.organization_id IS NULL)
         AND p.code IN ('hr.attendance.manage', 'hr.sanctions.write',
                         'hr.permissions.manage')`,
      [organizationId],
    );
    return rows.map(r => r.user_id);
  }

  private getSanctionTypeId(rule: SanctionRule): string {
    // Return a default or mapped sanction type ID
    // In production, this would be looked up from a sanction_types table
    const typeMap: Record<string, string> = {
      warning_letter: '00000000-0000-0000-0000-000000000001',
      formal_warning: '00000000-0000-0000-0000-000000000002',
      suspension: '00000000-0000-0000-0000-000000000003',
      termination: '00000000-0000-0000-0000-000000000004',
    };
    return typeMap[rule.type] || '00000000-0000-0000-0000-000000000000';
  }

  private calculateSuspensionStart(days: number): Date {
    const start = new Date();
    start.setDate(start.getDate() + 1); // Start tomorrow
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private calculateSuspensionEnd(days: number): Date {
    const end = new Date();
    end.setDate(end.getDate() + days);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  async getEmployeeSanctionStats(employeeId: string): Promise<{
    weeklyLateCount: number;
    monthlyLateCount: number;
    yearlyWarningCount: number;
    yearlySuspensionCount: number;
    activeSanctions: EmployeeSanction[];
  }> {
    const now = new Date();

    // Week bounds
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const weekStart = new Date(now);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);

    // Month bounds
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Year bounds
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [weeklyLateCount, monthlyLateCount, yearlyWarningCount, yearlySuspensionCount, activeSanctions] =
      await Promise.all([
        this.countLateAttendances(employeeId, weekStart, now),
        this.countLateAttendances(employeeId, monthStart, now),
        this.countSanctionsByType(employeeId, 'formal_warning', yearStart, now),
        this.countSanctionsByType(employeeId, 'suspension', yearStart, now),
        this.sanctionRepo.find({
          where: { employeeId, status: 'active' as SanctionStatus },
          order: { createdAt: 'DESC' },
        }),
      ]);

    return {
      weeklyLateCount,
      monthlyLateCount,
      yearlyWarningCount,
      yearlySuspensionCount,
      activeSanctions,
    };
  }

  async approveSanction(sanctionId: string, approvedBy: string, notes?: string): Promise<EmployeeSanction> {
    const sanction = await this.sanctionRepo.findOne({ where: { id: sanctionId } });
    if (!sanction) {
      throw new Error('Sanction non trouvée');
    }
    if (sanction.status === 'cancelled') {
      throw new Error('Impossible d\'approuver une sanction annulée');
    }
    if (sanction.sanctionedBy) {
      throw new Error('Sanction déjà approuvée');
    }

    sanction.sanctionedBy = approvedBy;
    sanction.sanctionDate = new Date();
    sanction.status = 'served' as SanctionStatus;
    if (notes) {
      sanction.notes = notes;
    }

    return this.sanctionRepo.save(sanction);
  }

  async cancelSanction(sanctionId: string, reason: string): Promise<EmployeeSanction> {
    const sanction = await this.sanctionRepo.findOne({ where: { id: sanctionId } });
    if (!sanction) {
      throw new Error('Sanction non trouvée');
    }

    sanction.status = 'cancelled' as SanctionStatus;
    sanction.notes = reason;

    return this.sanctionRepo.save(sanction);
  }
}
