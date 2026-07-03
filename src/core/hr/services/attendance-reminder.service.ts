import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Employee } from '../employee.entity';
import { Organization } from '../../organizations/organizations.entity';
import { InAppNotificationService } from '../../notifications/in-app-notification.service';
import { FcmService } from '../../notifications/fcm.service';

const DAY_CODES = [
  'sunday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday',
] as const;

const DEFAULT_START_TIME = '09:00';
const LATE_GRACE_MINUTES = 15;

/**
 * Service de rappels automatiques pour les pointages manquants.
 *
 * Cron : toutes les 5 minutes, 7h-19h, lun-ven (UTC). On vérifie pour
 * chaque organisation active si des employés devaient pointer leur
 * arrivée mais ne l'ont pas fait, et on envoie une notification in-app
 * + push FCM (vibration sur mobile).
 *
 * Garde-fous :
 *   - skip si jour non travaillé (selon employee.workDays)
 *   - skip si congé approuvé couvre aujourd'hui
 *   - skip si déjà pointé (actual_check_in IS NOT NULL)
 *   - skip si current time < workStartTime + 15min
 *   - skip si déjà notifié aujourd'hui (évite le spam toutes les 5min)
 */
@Injectable()
export class AttendanceReminderService {
  private readonly logger = new Logger(AttendanceReminderService.name);

  constructor(
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
    private readonly dataSource: DataSource,
    private readonly inAppNotificationService: InAppNotificationService,
    private readonly fcmService: FcmService,
  ) { }

  /**
   * Tick principal : toutes les 5 min, lun-ven, 7h-19h.
   * Itère sur toutes les organisations actives.
   */
  @Cron('*/5 7-19 * * 1-5')
  async tick(): Promise<void> {
    this.logger.log(`[tickLateCheckIns] firing at ${new Date().toISOString()}`);
    const orgs = await this.organizationsRepo.find({
      where: { isActive: true },
      select: ['id', 'nameCode'],
    });

    let totalNotified = 0;
    let totalSkipped = 0;
    for (const org of orgs) {
      try {
        const result = await this.checkAndNotifyLateCheckIns(org.id);
        totalNotified += result.notified;
        totalSkipped += result.skipped;
      } catch (err) {
        this.logger.warn(
          `Tick rappel pointage org ${org.nameCode ?? org.id} : ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `[tickLateCheckIns] done : notified=${totalNotified}, skipped=${totalSkipped}`,
    );
  }

  /**
   * Manuel : exécute les 3 ticks (late check-in, missing checkout,
   * incomplete yesterday) pour une organisation. Utilisé par l'endpoint
   * de debug pour tester sans attendre l'heure du cron.
   */
  async runAllTicksForOrg(organizationId: string): Promise<{
    lateCheckIns: { notified: number; skipped: number };
    missingCheckOuts: { notified: number; skipped: number };
    incompleteYesterday: { notified: number; skipped: number };
  }> {
    const lateCheckIns = await this.checkAndNotifyLateCheckIns(organizationId);
    const missingCheckOuts = await this.checkAndNotifyMissingCheckOuts(organizationId);
    const incompleteYesterday = await this.checkAndNotifyIncompleteYesterday(organizationId);
    return { lateCheckIns, missingCheckOuts, incompleteYesterday };
  }

  /**
   * Tick rappel départ : toutes les 10 min, 17h-21h, lun-ven.
   * Notifie les employés qui ont pointé l'arrivée mais pas le départ.
   */
  @Cron('*/10 17-21 * * 1-5')
  async tickCheckoutReminders(): Promise<void> {
    this.logger.log(
      `[tickCheckoutReminders] firing at ${new Date().toISOString()}`,
    );
    const orgs = await this.organizationsRepo.find({
      where: { isActive: true },
      select: ['id', 'nameCode'],
    });
    let totalNotified = 0;
    let totalSkipped = 0;
    for (const org of orgs) {
      try {
        const r = await this.checkAndNotifyMissingCheckOuts(org.id);
        totalNotified += r.notified;
        totalSkipped += r.skipped;
      } catch (err) {
        this.logger.warn(
          `Tick rappel départ org ${org.nameCode ?? org.id} : ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `[tickCheckoutReminders] done : notified=${totalNotified}, skipped=${totalSkipped}`,
    );
  }

  /**
   * Tick complétion lendemain : 9h30 lun-ven.
   * Notifie les employés qui n'ont pas pointé leur départ la veille
   * OU qui n'ont pas pointé du tout (absence totale sans congé).
   */
  @Cron('30 9 * * 1-5')
  async tickIncompleteYesterday(): Promise<void> {
    this.logger.log(
      `[tickIncompleteYesterday] firing at ${new Date().toISOString()}`,
    );
    const orgs = await this.organizationsRepo.find({
      where: { isActive: true },
      select: ['id', 'nameCode'],
    });
    let totalNotified = 0;
    let totalSkipped = 0;
    for (const org of orgs) {
      try {
        const r = await this.checkAndNotifyIncompleteYesterday(org.id);
        totalNotified += r.notified;
        totalSkipped += r.skipped;
      } catch (err) {
        this.logger.warn(
          `Tick incomplet hier org ${org.nameCode ?? org.id} : ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `[tickIncompleteYesterday] done : notified=${totalNotified}, skipped=${totalSkipped}`,
    );
  }

  /**
   * Vérifie tous les employés actifs d'une organisation et envoie un
   * rappel de pointage à ceux qui n'ont pas encore pointé. Best-effort :
   * une erreur sur un employé ne bloque pas les autres.
   */
  async checkAndNotifyLateCheckIns(
    organizationId: string,
  ): Promise<{ notified: number; skipped: number }> {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString().slice(0, 10); // YYYY-MM-DD

    const todayDayCode = DAY_CODES[now.getDay()];

    const employees = await this.employeesRepo.find({
      where: { organizationId, employmentStatus: 'active' },
    });

    let notified = 0;
    let skipped = 0;

    for (const emp of employees) {
      const should = await this.shouldNotifyLateCheckIn(emp, {
        now,
        today,
        todayIso,
        todayDayCode,
      });
      if (!should) {
        skipped++;
        continue;
      }

      try {
        await this.sendLateCheckInNotification(emp, organizationId, now);
        notified++;
      } catch (err) {
        this.logger.warn(
          `Échec rappel pointage employé ${emp.id} : ${(err as Error).message}`,
        );
      }
    }

    return { notified, skipped };
  }

  /**
   * Décide si un employé doit recevoir un rappel maintenant.
   * Retourne false dès qu'un garde-fou est violé.
   */
  private async shouldNotifyLateCheckIn(
    emp: Employee,
    ctx: { now: Date; today: Date; todayIso: string; todayDayCode: string },
  ): Promise<boolean> {
    // Sans userId, on ne peut pas envoyer de notif → skip silencieux.
    if (!emp.userId) return false;

    // Jour de travail ?
    const workDays = (emp.workDays ?? []).map(d => d.toLowerCase());
    if (workDays.length > 0 && !workDays.includes(ctx.todayDayCode)) {
      return false;
    }

    // Heure courante après workStartTime + 15 min ?
    const startTime = emp.workStartTime ?? DEFAULT_START_TIME;
    const [h, m] = startTime.split(':').map(Number);
    const threshold = new Date(ctx.today);
    threshold.setHours(h, m + LATE_GRACE_MINUTES, 0, 0);
    if (ctx.now < threshold) return false;

    // Congé approuvé couvrant aujourd'hui ?
    const onLeave = await this.dataSource.query(
      `SELECT 1 FROM module_c_rh.leave_requests
        WHERE employee_id = $1 AND status = 'approved'
          AND start_date <= $2 AND end_date >= $2
        LIMIT 1`,
      [emp.id, ctx.todayIso],
    );
    if (onLeave.length > 0) return false;

    // Déjà pointé son arrivée ?
    const checkedIn = await this.dataSource.query(
      `SELECT 1 FROM module_c_rh.office_attendances
        WHERE employee_id = $1
          AND attendance_date = $2
          AND actual_check_in IS NOT NULL
          AND deleted_at IS NULL
        LIMIT 1`,
      [emp.id, ctx.todayIso],
    );
    if (checkedIn.length > 0) return false;

    // Déjà notifié aujourd'hui ? Filtre via data->>'employeeId' pour
    // gérer le cas multi-employés (théorique : 1 user = 1 employé).
    const alreadyNotified = await this.dataSource.query(
      `SELECT 1 FROM core.notifications
        WHERE user_id = $1
          AND data->>'notificationType' = 'attendance_late_reminder'
          AND created_at >= $2
        LIMIT 1`,
      [emp.userId, ctx.today],
    );
    if (alreadyNotified.length > 0) return false;

    return true;
  }

  private async sendLateCheckInNotification(
    emp: Employee,
    organizationId: string,
    now: Date,
  ): Promise<void> {
    if (!emp.userId) return;
    const startTime = emp.workStartTime ?? DEFAULT_START_TIME;
    const currentTime = now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const title = 'Pointage manquant';
    const message =
      `Il est ${currentTime} et vous n'avez pas encore pointé votre arrivée. ` +
      `Heure prévue : ${startTime}.`;

    await this.inAppNotificationService.create({
      userId: emp.userId,
      organizationId,
      type: 'attendance_late_reminder',
      title,
      message,
      data: {
        employeeId: emp.id,
        scheduledTime: startTime,
        currentTime,
      },
    });

    // Push FCM : vibration automatique sur mobile, n'échoue pas si pas de token.
    void this.fcmService.sendToUser(
      emp.userId,
      title,
      `Il est ${currentTime} — pointez votre arrivée dès maintenant.`,
      {
        type: 'attendance_late_reminder',
        employeeId: emp.id,
        scheduledTime: startTime,
      },
    );
  }

  // ────────── BIS-2 : Rappel départ ──────────

  /**
   * Envoie un rappel aux employés qui ont pointé l'arrivée aujourd'hui mais
   * pas le départ, et dont l'heure courante > workEndTime + 15 min.
   */
  async checkAndNotifyMissingCheckOuts(
    organizationId: string,
  ): Promise<{ notified: number; skipped: number }> {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const toLocalIso = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    const todayIso = toLocalIso(today);

    // Pointages du jour avec check-in mais sans check-out.
    const rows: Array<{
      employee_id: string;
      attendance_id: string;
      user_id: string | null;
      work_end_time: string | null;
    }> = await this.dataSource.query(
      `SELECT oa.employee_id, oa.id AS attendance_id,
              e.user_id, e.work_end_time
         FROM module_c_rh.office_attendances oa
         INNER JOIN module_c_rh.employees e ON e.id = oa.employee_id
        WHERE oa.organization_id = $1
          AND oa.attendance_date = $2
          AND oa.actual_check_in IS NOT NULL
          AND oa.actual_check_out IS NULL
          AND oa.deleted_at IS NULL
          AND e.employment_status = 'active'`,
      [organizationId, todayIso],
    );

    let notified = 0;
    let skipped = 0;

    for (const r of rows) {
      if (!r.user_id) { skipped++; continue; }

      // Heure courante > workEndTime + 15 min ? Fallback 18:00.
      const endTime = r.work_end_time ?? '18:00';
      const [h, m] = endTime.split(':').map(Number);
      const threshold = new Date(today);
      threshold.setHours(h, m + LATE_GRACE_MINUTES, 0, 0);
      if (now < threshold) { skipped++; continue; }

      // Déjà notifié aujourd'hui ?
      const alreadyNotified = await this.dataSource.query(
        `SELECT 1 FROM core.notifications
          WHERE user_id = $1
            AND data->>'notificationType' = 'attendance_checkout_reminder'
            AND created_at >= $2
          LIMIT 1`,
        [r.user_id, today],
      );
      if (alreadyNotified.length > 0) { skipped++; continue; }

      try {
        const currentTime = now.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const title = 'Pointage de départ manquant';
        const message =
          `Il est ${currentTime} et vous n'avez pas encore pointé votre départ. ` +
          `Heure prévue : ${endTime}.`;

        await this.inAppNotificationService.create({
          userId: r.user_id,
          organizationId,
          type: 'attendance_checkout_reminder',
          title,
          message,
          data: {
            employeeId: r.employee_id,
            attendanceId: r.attendance_id,
            scheduledTime: endTime,
            currentTime,
          },
        });

        void this.fcmService.sendToUser(
          r.user_id,
          title,
          `Pointez votre départ ou choisissez "Pointer plus tard".`,
          {
            type: 'attendance_checkout_reminder',
            employeeId: r.employee_id,
            attendanceId: r.attendance_id,
          },
        );

        notified++;
      } catch (err) {
        this.logger.warn(
          `Échec rappel départ employé ${r.employee_id} : ${(err as Error).message}`,
        );
      }
    }

    return { notified, skipped };
  }

  //  Pointages incomplets de la veille 

  async checkAndNotifyIncompleteYesterday(
    organizationId: string,
  ): Promise<{ notified: number; skipped: number }> {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const toLocalIso = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    const yesterdayIso = toLocalIso(yesterday);
    const yesterdayDayCode = DAY_CODES[yesterday.getDay()].slice(0, 3);

    // 1. Récupère tous les employés actifs, leur user_id et workDays.
    const employees = await this.employeesRepo.find({
      where: { organizationId, employmentStatus: 'active' },
      select: ['id', 'userId', 'workDays'],
    });

    let notified = 0;
    let skipped = 0;

    for (const emp of employees) {
      if (!emp.userId) { skipped++; continue; }

      // Hier était-il un jour de travail pour cet employé ?
      const workDays = (emp.workDays ?? []).map(d => d.toLowerCase());
      if (workDays.length > 0 && !workDays.includes(yesterdayDayCode)) {
        skipped++;
        continue;
      }

      // L'employé était-il en congé approuvé hier ?
      const onLeave = await this.dataSource.query(
        `SELECT 1 FROM module_c_rh.leave_requests
          WHERE employee_id = $1 AND status = 'approved'
            AND start_date <= $2 AND end_date >= $2
          LIMIT 1`,
        [emp.id, yesterdayIso],
      );
      if (onLeave.length > 0) { skipped++; continue; }

      // Le pointage d'hier — peut être inexistant (absent total),
      // incomplet (check-in sans check-out), ou complet (skip).
      const att: Array<{
        id: string;
        actual_check_in: string | null;
        actual_check_out: string | null;
      }> = await this.dataSource.query(
        `SELECT id, actual_check_in, actual_check_out
           FROM module_c_rh.office_attendances
          WHERE employee_id = $1
            AND attendance_date = $2
            AND deleted_at IS NULL
          LIMIT 1`,
        [emp.id, yesterdayIso],
      );

      // 3 cas à gérer :
      let scenario: 'incomplete' | 'absent' | null = null;
      let attendanceId: string | null = null;

      if (att.length === 0) {
        // Aucun pointage du tout → absence totale
        scenario = 'absent';
      } else if (att[0].actual_check_in && !att[0].actual_check_out) {
        scenario = 'incomplete';
        attendanceId = att[0].id;
      } else {
        // Pointage complet ou pas de check-in mais ligne admin → skip
        skipped++;
        continue;
      }

      // Déjà notifié pour CE jour ?
      const alreadyNotified = await this.dataSource.query(
        `SELECT 1 FROM core.notifications
          WHERE user_id = $1
            AND data->>'notificationType' = 'attendance_incomplete_yesterday'
            AND data->>'incompleteDate' = $2
          LIMIT 1`,
        [emp.userId, yesterdayIso],
      );
      if (alreadyNotified.length > 0) { skipped++; continue; }

      try {
        const title = scenario === 'absent'
          ? 'Aucun pointage hier'
          : 'Pointage incomplet hier';
        const message = scenario === 'absent'
          ? 'Hier était un jour de travail et aucun pointage n\'a été enregistré. ' +
          'Veuillez soumettre votre rapport et répondre aux questions du gardien.'
          : 'Vous n\'avez pas pointé votre départ hier. Veuillez compléter votre ' +
          'pointage, votre rapport et les questions du gardien.';

        await this.inAppNotificationService.create({
          userId: emp.userId,
          organizationId,
          type: 'attendance_incomplete_yesterday',
          title,
          message,
          data: {
            employeeId: emp.id,
            attendanceId,
            incompleteDate: yesterdayIso,
            scenario,
          },
        });

        void this.fcmService.sendToUser(
          emp.userId,
          title,
          'Complétez vos données depuis l\'onglet Présence.',
          {
            type: 'attendance_incomplete_yesterday',
            employeeId: emp.id,
            attendanceId: attendanceId ?? '',
            incompleteDate: yesterdayIso,
            scenario,
          },
        );

        notified++;
      } catch (err) {
        this.logger.warn(
          `Échec notif incomplet hier employé ${emp.id} : ${(err as Error).message}`,
        );
      }
    }

    return { notified, skipped };
  }
}
