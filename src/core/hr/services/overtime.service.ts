import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Employee } from '../employee.entity';
import { Organization } from '../../organizations/organizations.entity';
import { InAppNotificationService } from '../../notifications/in-app-notification.service';

const DAY_CODES = [
  'sunday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday',
] as const;

/**
 * L'UI stocke parfois les workDays en format court (`mon, wed, fri`) et
 * parfois en format long (`monday, wednesday, friday`). On normalise les
 * deux formes vers la version longue pour la comparaison.
 */
const DAY_ALIASES: Record<string, string> = {
  sun: 'sunday', mon: 'monday', tue: 'tuesday', wed: 'wednesday',
  thu: 'thursday', fri: 'friday', sat: 'saturday',
  sunday: 'sunday', monday: 'monday', tuesday: 'tuesday',
  wednesday: 'wednesday', thursday: 'thursday', friday: 'friday',
  saturday: 'saturday',
};

function normalizeWorkDays(workDays: string[]): Set<string> {
  return new Set(
    workDays
      .map(d => DAY_ALIASES[String(d).toLowerCase().trim()])
      .filter((d): d is string => !!d),
  );
}

/**
 * Une journée d'attendance enrichie avec :
 *   - workedMinutes : temps réel travaillé = checkOut − checkIn
 *   - scheduledMinutes : durée prévue = workEnd − workStart (0 si jour de repos)
 *   - diffMinutes : worked − scheduled (positif = HS, négatif = déficit)
 *   - isIncomplete : pointage commencé sans checkout (impossible à calculer)
 *
 * lateMinutes est gardé séparément (retard d'arrivée) pour la discipline,
 * indépendamment du calcul net HS/déficit.
 */
export interface OvertimeDay {
  date: string;
  isWorkDay: boolean;
  dayCode: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledMinutes: number;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  workedMinutes: number | null;
  diffMinutes: number | null;
  isIncomplete: boolean;
  status: string;
  lateMinutes: number;
  isJustified: boolean;
}

export interface OvertimeForEmployee {
  employeeId: string;
  month: number;
  year: number;
  totalOvertimeMinutes: number;
  totalDeficitMinutes: number;
  totalLateMinutes: number;
  totalWorkedMinutes: number;
  totalScheduledMinutes: number;
  incompleteDays: number;
  daysWithOvertime: number;
  daysWithDeficit: number;
  days: OvertimeDay[];
  workSchedule: {
    workDays: string[];
    workStartTime: string | null;
    workEndTime: string | null;
  };
}

export interface OvertimeSummaryItem {
  employeeId: string;
  employeeNumber: string;
  name: string;
  totalOvertimeMinutes: number;
  totalDeficitMinutes: number;
  totalLateMinutes: number;
  incompleteDays: number;
}

export interface OvertimeSummary {
  orgId: string;
  month: number;
  year: number;
  totalEmployees: number;
  employeesWithOvertime: number;
  summaries: OvertimeSummaryItem[];
}

@Injectable()
export class OvertimeService {
  private readonly logger = new Logger(OvertimeService.name);

  constructor(
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
    private readonly dataSource: DataSource,
    private readonly inAppNotificationService: InAppNotificationService,
  ) {}

  async getOvertimeForEmployee(
    orgId: string,
    empId: string,
    month: number,
    year: number,
  ): Promise<OvertimeForEmployee> {
    const employee = await this.employeesRepo.findOne({
      where: { id: empId, organizationId: orgId },
      relations: ['user'],
    });
    if (!employee) throw new Error('Employé non trouvé');

    const { startDate, endDate } = this.getMonthBounds(year, month);
    const workDaysRaw: string[] = Array.isArray(employee.workDays) ? employee.workDays : [];
    const workDaysNormalized = normalizeWorkDays(workDaysRaw);
    const workStartTime = employee.workStartTime ?? null;
    const workEndTime = employee.workEndTime ?? null;

    // Si l'employé n'a pas d'horaire configuré, on ne peut pas calculer un
    // écart HS/déficit (pas de référence). On retournera des compteurs à 0
    // et la table affichera juste le temps travaillé.
    const hasSchedule = !!(workStartTime && workEndTime);
    const scheduledDayMinutes = hasSchedule
      ? Math.max(0, this.timeToMinutes(workEndTime!) - this.timeToMinutes(workStartTime!))
      : 0;

    const records: Array<{
      id: string;
      attendance_date: Date | string;
      actual_check_in: string | null;
      actual_check_out: string | null;
      scheduled_check_in: string | null;
      scheduled_check_out: string | null;
      status: string;
      is_justified: boolean;
    }> = await this.dataSource.query(
      `SELECT id, attendance_date, actual_check_in, actual_check_out,
              scheduled_check_in, scheduled_check_out, status, is_justified
       FROM module_c_rh.office_attendances
       WHERE employee_id = $1 AND organization_id = $2
         AND attendance_date >= $3 AND attendance_date <= $4
         AND deleted_at IS NULL
       ORDER BY attendance_date ASC`,
      [empId, orgId, startDate, endDate],
    );

    const days: OvertimeDay[] = [];
    let totalOvertimeMinutes = 0;
    let totalDeficitMinutes = 0;
    let totalLateMinutes = 0;
    let totalWorkedMinutes = 0;
    let totalScheduledMinutes = 0;
    let incompleteDays = 0;
    let daysWithOvertime = 0;
    let daysWithDeficit = 0;

    for (const r of records) {
      const dateStr = r.attendance_date instanceof Date
        ? r.attendance_date.toISOString().slice(0, 10)
        : String(r.attendance_date).slice(0, 10);

      const date = new Date(`${dateStr}T00:00:00`);
      const dayCode = DAY_CODES[date.getDay()];
      // Si aucun workDays configuré → on considère tous les jours comme travaillés
      // (compat ancienne config). Sinon, comparaison via le set normalisé.
      const isWorkDay = workDaysNormalized.size === 0 || workDaysNormalized.has(dayCode);

      const hasCheckIn = !!r.actual_check_in;
      const hasCheckOut = !!r.actual_check_out;

      // Durée prévue : 0 pour un jour non travaillé (tout ce qui est pointé
      // ce jour-là devient donc HS).
      const scheduledMinutes = isWorkDay ? scheduledDayMinutes : 0;

      let workedMinutes: number | null = null;
      let diffMinutes: number | null = null;
      let isIncomplete = false;

      if (hasCheckIn && hasCheckOut) {
        // Calcul net : worked = checkOut − checkIn (sans pause déduite ici,
        // cohérent avec scheduledMinutes qui n'en déduit pas non plus).
        const w = Math.max(
          0,
          this.timeToMinutes(r.actual_check_out!) - this.timeToMinutes(r.actual_check_in!),
        );
        workedMinutes = w;
        totalWorkedMinutes += w;

        // On ne calcule l'écart HS/déficit que si on a une référence :
        //   - horaire configuré pour les jours travaillés
        //   - OU jour de repos (référence implicite = 0h)
        // Sans horaire, on affiche juste le temps travaillé (diffMinutes = null).
        if (hasSchedule || !isWorkDay) {
          diffMinutes = w - scheduledMinutes;
          if (diffMinutes > 0) {
            totalOvertimeMinutes += diffMinutes;
            daysWithOvertime += 1;
          } else if (diffMinutes < 0) {
            totalDeficitMinutes += -diffMinutes;
            daysWithDeficit += 1;
          }
        }
      } else if (hasCheckIn && !hasCheckOut) {
        // Donnée manquante : on ne calcule rien (pas d'invention).
        isIncomplete = true;
        incompleteDays += 1;
      } else if (!hasCheckIn && !hasCheckOut && isWorkDay && hasSchedule) {
        // Aucun pointage sur un jour qui devait être travaillé (avec horaire
        // défini) : on comptabilise le déficit complet (= la journée prévue).
        workedMinutes = 0;
        diffMinutes = -scheduledMinutes;
        if (scheduledMinutes > 0) {
          totalDeficitMinutes += scheduledMinutes;
          daysWithDeficit += 1;
        }
      }

      totalScheduledMinutes += scheduledMinutes;

      // Retard d'arrivée : indépendant du calcul net, sert au volet discipline.
      let lateMinutes = 0;
      if (isWorkDay && workStartTime && hasCheckIn) {
        const late = this.timeToMinutes(r.actual_check_in!) - this.timeToMinutes(workStartTime);
        if (late > 0) {
          lateMinutes = late;
          totalLateMinutes += late;
        }
      }

      days.push({
        date: dateStr,
        isWorkDay,
        dayCode,
        scheduledStart: workStartTime,
        scheduledEnd: workEndTime,
        scheduledMinutes,
        actualCheckIn: r.actual_check_in,
        actualCheckOut: r.actual_check_out,
        workedMinutes,
        diffMinutes,
        isIncomplete,
        status: r.status,
        lateMinutes,
        isJustified: r.is_justified,
      });
    }

    return {
      employeeId: empId,
      month,
      year,
      totalOvertimeMinutes,
      totalDeficitMinutes,
      totalLateMinutes,
      totalWorkedMinutes,
      totalScheduledMinutes,
      incompleteDays,
      daysWithOvertime,
      daysWithDeficit,
      days,
      workSchedule: { workDays: workDaysRaw, workStartTime, workEndTime },
    };
  }

  async getOvertimeSummary(
    orgId: string,
    month: number,
    year: number,
  ): Promise<OvertimeSummary> {
    const employees = await this.employeesRepo.find({
      where: { organizationId: orgId, employmentStatus: 'active' },
      relations: ['user'],
    });

    const summaries: OvertimeSummaryItem[] = [];

    for (const emp of employees) {
      try {
        const data = await this.getOvertimeForEmployee(orgId, emp.id, month, year);
        if (data.totalOvertimeMinutes > 0 || data.totalDeficitMinutes > 0 || data.totalLateMinutes > 0) {
          const firstName = (emp.user as any)?.firstName ?? '';
          const lastName = (emp.user as any)?.lastName ?? '';
          const name = `${firstName} ${lastName}`.trim() || emp.employeeNumber;
          summaries.push({
            employeeId: emp.id,
            employeeNumber: emp.employeeNumber,
            name,
            totalOvertimeMinutes: data.totalOvertimeMinutes,
            totalDeficitMinutes: data.totalDeficitMinutes,
            totalLateMinutes: data.totalLateMinutes,
            incompleteDays: data.incompleteDays,
          });
        }
      } catch {
        // skip employees with errors silently
      }
    }

    summaries.sort((a, b) => b.totalOvertimeMinutes - a.totalOvertimeMinutes);

    return {
      orgId,
      month,
      year,
      totalEmployees: employees.length,
      employeesWithOvertime: summaries.filter(s => s.totalOvertimeMinutes > 0).length,
      summaries,
    };
  }

  /** Cron le 25 de chaque mois à 9h : envoi du résumé heures supp aux admins RH. */
  @Cron('0 9 25 * *')
  async sendPaydayNotifications(): Promise<void> {
    this.logger.log('[OvertimeService] sendPaydayNotifications firing');
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const orgs = await this.organizationsRepo.find({
      where: { isActive: true },
      select: ['id', 'nameCode'],
    });

    for (const org of orgs) {
      try {
        await this.sendOvertimeSummaryToAdmins(org.id, month, year);
      } catch (err) {
        this.logger.warn(
          `Overtime payday notif error for org ${(org as any).nameCode ?? org.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async sendOvertimeSummaryToAdmins(
    orgId: string,
    month: number,
    year: number,
  ): Promise<void> {
    const summary = await this.getOvertimeSummary(orgId, month, year);
    if (summary.employeesWithOvertime === 0) return;

    const adminIds = await this.findHrAdminUserIds(orgId);
    if (adminIds.length === 0) return;

    const totalMinutes = summary.summaries.reduce((acc, s) => acc + s.totalOvertimeMinutes, 0);
    const totalHours = (totalMinutes / 60).toFixed(1);

    await this.inAppNotificationService.createMany(
      adminIds.map(uid => ({
        userId: uid,
        organizationId: orgId,
        type: 'payday_overtime_summary' as any,
        title: `Résumé heures supp. — ${String(month).padStart(2, '0')}/${year}`,
        message:
          `${summary.employeesWithOvertime} employé(s) ont des heures supplémentaires ce mois-ci ` +
          `(total : ${totalHours}h).`,
        data: {
          month,
          year,
          orgId,
          employeesWithOvertime: summary.employeesWithOvertime,
          totalHours,
          summaries: summary.summaries.slice(0, 20),
        },
      })),
    );
  }

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
         AND p.code IN ('hr.leave.approve', 'hr.attendance.manage')`,
      [organizationId],
    );
    return rows.map(r => r.user_id);
  }

  private getMonthBounds(year: number, month: number): { startDate: string; endDate: string } {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate, endDate };
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
  }
}
