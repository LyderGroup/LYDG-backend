import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, IsNull } from 'typeorm';
import { OfficeAttendance, AttendanceStatus } from '../entities/office-attendance.entity';
import { Employee } from '../employee.entity';
import { GeofenceService } from './geofence.service';
import { AutomaticSanctionService } from './automatic-sanction.service';
import { HrRealtimeService } from '../hr-realtime.service';
import { ProjectsService } from '../../projects/projects.service';
import { DailyJournalService, type JournalTaskLine } from './daily-journal.service';
import { toIsoDate } from '../../../common/utils/date.util';

export interface CheckInInput {
  employeeId: string;
  scheduledCheckIn?: string;
  scheduledCheckOut?: string;
  scheduledHours?: number;
  latitude?: number;
  longitude?: number;
  offSiteLocation?: string;
  offSiteReason?: string;
}

export interface CheckOutInput {
  attendanceId: string;
  /**
   * Tâches que l'employé déclare terminées en pointant son départ.
   * Elles avancent dans LEUR workflow (donc passent en revue si le projet
   * l'exige, plutôt que d'être closes autoritairement) puis alimentent le
   * brouillon du rapport journalier.
   */
  completedTaskIds?: string[];
  /** Contexte nécessaire pour faire avancer les tâches au nom de l'employé. */
  userId?: string;
  contextOrganizationId?: string;
  permissionCodes?: string[];
  /**
   * Position au moment du départ. Être hors zone n'empêche PAS de pointer :
   * on enregistre simplement le lieu et le motif, comme à l'arrivée. Bloquer
   * quelqu'un qui termine sa journée en clientèle ou en télétravail revient à
   * lui faire perdre ses heures.
   */
  latitude?: number;
  longitude?: number;
  offSiteLocation?: string;
  offSiteReason?: string;
}

export interface JustifyAbsenceInput {
  attendanceId: string;
  notes: string;
  documentUrl?: string;
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(OfficeAttendance)
    private readonly attendanceRepo: Repository<OfficeAttendance>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly dataSource: DataSource,
    private readonly geofenceService: GeofenceService,
    // forwardRef pour éviter la dépendance circulaire (AutomaticSanctionService
    // injecte OfficeAttendance, comme nous).
    @Inject(forwardRef(() => AutomaticSanctionService))
    private readonly sanctionService: AutomaticSanctionService,
    private readonly realtime: HrRealtimeService,
    private readonly projectsService: ProjectsService,
    private readonly dailyJournalService: DailyJournalService,
  ) { }

  private readonly logger = new Logger(AttendanceService.name);

  async checkIn(
    organizationId: string,
    input: CheckInInput,
  ): Promise<OfficeAttendance> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await this.attendanceRepo.findOne({
      where: {
        employeeId: input.employeeId,
        attendanceDate: today,
      },
    });

    if (existing && existing.actualCheckIn) {
      throw new BadRequestException('Vous avez déjà pointé votre arrivée aujourd\'hui');
    }

    // Fetch employee to get their work schedule
    const employee = await this.employeeRepo.findOne({
      where: { id: input.employeeId },
    });

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    let status: AttendanceStatus = 'present';

    // Use employee's work start time or fallback to input or default
    const defaultCheckIn = employee?.workStartTime || input.scheduledCheckIn || '09:00';
    const defaultCheckOut = employee?.workEndTime || input.scheduledCheckOut || '18:00';
    const defaultHours = input.scheduledHours || 8;

    // Calculate status:
    // - Present: checked in at or before scheduled time
    // - Late: checked in after scheduled time
    const scheduled = this.timeToMinutes(defaultCheckIn);
    const actual = this.timeToMinutes(currentTime);

    // Un pointage effectué un jour NON travaillé ne peut pas être « en
    // retard » : il n'y a pas d'heure d'arrivée attendue ce jour-là. On se
    // contente d'enregistrer la présence et les heures effectuées, sans
    // déclencher les vérifications disciplinaires.
    const worksToday = this.isWorkDay(employee?.workDays, now);

    if (!worksToday) {
      status = 'present';
    } else if (actual > scheduled) {
      status = 'late';
    } else {
      status = 'present';
    }

    if (existing) {
      existing.actualCheckIn = currentTime;
      existing.scheduledCheckIn = defaultCheckIn;
      existing.scheduledCheckOut = defaultCheckOut;
      existing.scheduledHours = defaultHours;
      // Si l'employé était marqué absent, il est maintenant en retard —
      // sauf hors jour de travail, où « absent » n'a pas de sens non plus.
      if (existing.status === 'absent' && worksToday) {
        existing.status = 'late';
      } else {
        existing.status = status;
      }
      const saved = await this.attendanceRepo.save(existing);
      this.emitCheckInRealtime(saved, employee);
      if (worksToday) {
        this.triggerDisciplineChecksIfLate(saved);
      }
      return saved;
    }

    // Vérifier la géolocalisation si fournie
    let isInZone = true;
    if (input.latitude !== undefined && input.longitude !== undefined) {
      const locationCheck = await this.geofenceService.checkLocation(organizationId, {
        latitude: input.latitude,
        longitude: input.longitude,
      });
      isInZone = locationCheck.isInZone;
    }

    // Si hors zone sans justification, rejeter
    if (!isInZone && !input.offSiteReason) {
      throw new BadRequestException('Vous n\'êtes pas dans la zone autorisée. Veuillez indiquer le lieu et la raison de votre pointage hors site.');
    }

    const attendance = this.attendanceRepo.create({
      employeeId: input.employeeId,
      organizationId,
      attendanceDate: today,
      scheduledCheckIn: defaultCheckIn,
      scheduledCheckOut: defaultCheckOut,
      scheduledHours: defaultHours,
      actualCheckIn: currentTime,
      status,
      // Géolocalisation
      checkInLatitude: input.latitude ?? null,
      checkInLongitude: input.longitude ?? null,
      isInZone,
      offSiteLocation: input.offSiteLocation ?? null,
      offSiteReason: input.offSiteReason ?? null,
    });

    const saved = await this.attendanceRepo.save(attendance);
    this.emitCheckInRealtime(saved, employee);
    if (worksToday) {
      this.triggerDisciplineChecksIfLate(saved);
    }
    return saved;
  }

  /**
   * Déclenche en arrière-plan la vérification des seuils disciplinaires
   * (notifs anticipatives + sanctions auto) lorsqu'un pointage est en
   * retard. `void` intentionnel : best-effort, ne bloque pas le check-in.
   */
  private triggerDisciplineChecksIfLate(attendance: OfficeAttendance): void {
    if (attendance.status !== 'late') return;
    void this.sanctionService
      .checkApproachingThresholds(attendance.employeeId, attendance.organizationId)
      .catch(() => {}); // log déjà fait dans le service
    void this.sanctionService
      .checkEmployeeSanctions(attendance.employeeId, attendance.organizationId)
      .catch(() => {});
  }

  /**
   * Diffuse en temps réel le check-in à la room org:attendance + à la room
   * personnelle de l'employé. Best-effort.
   */
  private emitCheckInRealtime(
    attendance: OfficeAttendance,
    employee: Employee | null,
  ): void {
    const employeeName = employee?.user
      ? `${(employee.user as any).firstName ?? ''} ${(employee.user as any).lastName ?? ''}`.trim()
      : undefined;
    this.realtime.emitAttendanceCheckIn({
      organizationId: attendance.organizationId,
      attendanceId: attendance.id,
      employeeId: attendance.employeeId,
      employeeName,
      checkInTime: attendance.actualCheckIn ?? '',
      status: attendance.status,
      isLate: attendance.status === 'late',
      userId: employee?.userId ?? null,
    });
  }

  async checkOut(input: CheckOutInput): Promise<OfficeAttendance> {
    const attendance = await this.attendanceRepo.findOne({
      where: { id: input.attendanceId },
    });

    if (!attendance) {
      throw new NotFoundException('Pointage non trouvé');
    }

    if (!attendance.actualCheckIn) {
      throw new BadRequestException('Vous devez d\'abord pointer votre arrivée');
    }

    if (attendance.actualCheckOut) {
      throw new BadRequestException('Vous avez déjà pointé votre départ');
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    attendance.actualCheckOut = currentTime;

    // Position de sortie : enregistrée pour la traçabilité RH, jamais
    // bloquante. Si l'employé est hors zone, on conserve le lieu et le motif
    // qu'il déclare ; c'est au RH d'apprécier, pas au système de refuser.
    if (input.latitude !== undefined && input.longitude !== undefined) {
      attendance.checkOutLatitude = input.latitude;
      attendance.checkOutLongitude = input.longitude;

      try {
        const check = await this.geofenceService.checkLocation(attendance.organizationId, {
          latitude: input.latitude,
          longitude: input.longitude,
        });
        if (!check.isInZone) {
          // On n'écrase pas une éventuelle justification d'arrivée : on
          // complète seulement si le départ en fournit une.
          if (input.offSiteLocation) attendance.offSiteLocation = input.offSiteLocation;
          if (input.offSiteReason) attendance.offSiteReason = input.offSiteReason;
        }
      } catch {
        // Géofence indisponible : on garde les coordonnées et on continue.
      }
    } else {
      if (input.offSiteLocation) attendance.offSiteLocation = input.offSiteLocation;
      if (input.offSiteReason) attendance.offSiteReason = input.offSiteReason;
    }

    const checkInMinutes = this.timeToMinutes(attendance.actualCheckIn);
    const checkOutMinutes = this.timeToMinutes(currentTime);
    const workedMinutes = checkOutMinutes - checkInMinutes;
    attendance.actualHours = Math.round((workedMinutes / 60) * 100) / 100;

    if (attendance.actualHours < (attendance.scheduledHours ?? 8) - 0.5) {
      attendance.status = 'early_leave';
    }

    const saved = await this.attendanceRepo.save(attendance);

    // Émission temps réel best-effort.
    try {
      const emp = await this.employeeRepo.findOne({
        where: { id: saved.employeeId },
        relations: ['user'],
      });
      this.realtime.emitAttendanceCheckOut({
        organizationId: saved.organizationId,
        attendanceId: saved.id,
        employeeId: saved.employeeId,
        employeeName: emp?.user
          ? `${(emp.user as any).firstName ?? ''} ${(emp.user as any).lastName ?? ''}`.trim()
          : undefined,
        checkOutTime: saved.actualCheckOut ?? '',
        workedHours: saved.actualHours ?? undefined,
        userId: emp?.userId ?? null,
      });
    } catch {
      // best-effort
    }

    // Tâches déclarées terminées → avancement du workflow + brouillon de
    // rapport. Entièrement best-effort : on ne bloque JAMAIS un départ parce
    // qu'une tâche ou un journal a échoué.
    await this.applyCompletedTasksOnCheckOut(saved, input);

    return saved;
  }

  /**
   * Fait avancer les tâches cochées dans leur workflow, puis pré-remplit le
   * rapport journalier avec le résultat.
   *
   * On réutilise `moveTaskToNextWorkflowStep` du module Projets plutôt que
   * d'écrire `status = 'completed'` : une tâche dont l'étape suivante exige
   * une validation part en revue et notifie l'approbateur. Court-circuiter ce
   * chemin retirerait aux managers la main sur la clôture.
   */
  private async applyCompletedTasksOnCheckOut(
    attendance: OfficeAttendance,
    input: CheckOutInput,
  ): Promise<void> {
    const taskIds = (input.completedTaskIds ?? []).filter(Boolean);
    if (taskIds.length === 0) return;
    if (!input.userId || !input.contextOrganizationId) return;

    const lines: JournalTaskLine[] = [];

    for (const taskId of taskIds) {
      try {
        const result = await this.projectsService.moveTaskToNextWorkflowStep({
          taskId,
          userId: input.userId,
          contextOrganizationId: input.contextOrganizationId,
          permissionCodes: input.permissionCodes ?? [],
        });

        const task = await this.projectsService.getTaskSummaryForJournal(taskId);
        lines.push({
          title: task?.title ?? 'Tâche',
          projectName: task?.projectName ?? null,
          isFinal: !!result.isFinalStep,
          stepName: result.toStepName ?? null,
        });
      } catch (err) {
        // Une tâche refusée (droits, étape finale déjà atteinte…) ne doit pas
        // empêcher les autres d'avancer ni bloquer le pointage.
        this.logger.warn(
          `Tâche ${taskId} non avancée au pointage de départ : ${(err as Error).message}`,
        );
      }
    }

    if (lines.length === 0) return;

    await this.dailyJournalService.prefillFromCompletedTasks({
      employeeId: attendance.employeeId,
      date: toIsoDate(attendance.attendanceDate),
      tasks: lines,
    });
  }

  async justifyAbsence(
    organizationId: string,
    input: JustifyAbsenceInput,
    validatedBy: string,
  ): Promise<OfficeAttendance> {
    const attendance = await this.attendanceRepo.findOne({
      where: { id: input.attendanceId, organizationId },
    });

    if (!attendance) {
      throw new NotFoundException('Pointage non trouvé');
    }

    attendance.isJustified = true;
    attendance.justificationNotes = input.notes;
    attendance.justificationDocumentUrl = input.documentUrl ?? null;
    attendance.validatedBy = validatedBy;
    attendance.validatedAt = new Date();

    return this.attendanceRepo.save(attendance);
  }

  async markAsAbsent(
    employeeId: string,
    date: Date,
    organizationId: string,
  ): Promise<OfficeAttendance> {
    const attendance = this.attendanceRepo.create({
      employeeId,
      organizationId,
      attendanceDate: date,
      status: 'absent' as AttendanceStatus,
    });

    return this.attendanceRepo.save(attendance);
  }


  async getEmployeeAttendance(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<OfficeAttendance[]> {
    return this.attendanceRepo.find({
      where: {
        employeeId,
        attendanceDate: Between(startDate, endDate),
        deletedAt: IsNull() as any,
      },
      order: { attendanceDate: 'ASC' },
    });
  }

  async getTeamAttendance(
    organizationId: string,
    departmentId: string,
    date: Date | null,
  ): Promise<OfficeAttendance[]> {
    console.log('[AttendanceService] getTeamAttendance - orgId:', organizationId, 'date:', date, 'deptId:', departmentId);

    // Si pas de date, utiliser aujourd'hui
    const targetDate = date ?? new Date();
    targetDate.setHours(0, 0, 0, 0);

    // Récupérer tous les employés actifs de l'organisation
    const employeesQuery = this.employeeRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'u')
      .leftJoinAndSelect('e.department', 'd')
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.employmentStatus = :status', { status: 'active' });

    if (departmentId) {
      employeesQuery.andWhere('e.departmentId = :deptId', { deptId: departmentId });
    }

    const employees = await employeesQuery.getMany();
    console.log('[AttendanceService] Found', employees.length, 'active employees');

    // Récupérer les pointages existants pour la date
    const attendances = await this.attendanceRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.employee', 'e')
      .leftJoinAndSelect('e.user', 'u')
      .leftJoinAndSelect('e.department', 'd')
      .where('a.organizationId = :orgId', { orgId: organizationId })
      .andWhere('a.attendanceDate = :date', { date: targetDate })
      .andWhere('a.deletedAt IS NULL')
      .getMany();

    console.log('[AttendanceService] Found', attendances.length, 'existing attendances');

    // Créer un map des pointages par employé
    const attendanceMap = new Map<string, OfficeAttendance>();
    for (const att of attendances) {
      if (att.employeeId) {
        attendanceMap.set(att.employeeId, att);
      }
    }

    // Construire la liste résultat: pour chaque employé, créer ou utiliser le pointage
    const result: OfficeAttendance[] = [];

    for (const employee of employees) {
      const existingAttendance = attendanceMap.get(employee.id);

      if (existingAttendance) {
        // L'employé a déjà un pointage
        result.push(existingAttendance);
      } else {
        // Déterminer le statut en fonction de l'heure de début + 30 min de tolérance
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const workStartTime = employee.workStartTime || '09:00';
        const startMinutes = this.timeToMinutes(workStartTime);

        // Absent si l'heure actuelle dépasse l'heure de début + 30 min de tolérance
        // (l'employé a dépassé le délai de pointage sans pointer)
        const isAfterDeadline = currentMinutes >= startMinutes + 30;

        const absentAttendance = this.attendanceRepo.create({
          organizationId,
          employeeId: employee.id,
          employee: employee,
          attendanceDate: targetDate,
          status: isAfterDeadline ? 'absent' : 'present',
          actualCheckIn: null,
          actualCheckOut: null,
          notes: isAfterDeadline ? 'Dépassement du délai de pointage' : 'En attente de pointage',
        });
        result.push(absentAttendance);
      }
    }

    console.log('[AttendanceService] Returning', result.length, 'records');
    return result;
  }

  async getTodayAttendance(employeeId: string): Promise<OfficeAttendance | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.attendanceRepo.findOne({
      where: {
        employeeId,
        attendanceDate: today,
      },
      relations: ['employee', 'employee.user', 'employee.department'],
    });
  }


  async getMonthlyStats(
    employeeId: string,
    month: number,
    year: number,
  ): Promise<{
    totalDays: number;
    presentDays: number;
    absentDays: number;
    lateDays: number;
    earlyLeaveDays: number;
    totalHours: number;
    avgHoursPerDay: number;
  }> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const attendances = await this.getEmployeeAttendance(employeeId, startDate, endDate);

    const presentDays = attendances.filter(a =>
      ['present', 'late', 'early_leave', 'partial'].includes(a.status)
    ).length;

    const totalHours = attendances
      .filter(a => a.actualHours)
      .reduce((sum, a) => sum + (a.actualHours ?? 0), 0);

    return {
      totalDays: attendances.length,
      presentDays,
      absentDays: attendances.filter(a => a.status === 'absent').length,
      lateDays: attendances.filter(a => a.status === 'late').length,
      earlyLeaveDays: attendances.filter(a => a.status === 'early_leave').length,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHoursPerDay: presentDays > 0 ? Math.round((totalHours / presentDays) * 100) / 100 : 0,
    };
  }

  async getTeamMonthlyStats(
    organizationId: string,
    departmentId: string,
    month: number,
    year: number,
  ): Promise<{
    employeeId: string;
    employeeName: string;
    presentDays: number;
    absentDays: number;
    lateDays: number;
    totalHours: number;
  }[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const employeeQuery = this.employeeRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'u')
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.employmentStatus = :status', { status: 'active' });

    if (departmentId) {
      employeeQuery.andWhere('e.departmentId = :deptId', { deptId: departmentId });
    }

    const employees = await employeeQuery.getMany();

    const stats: Array<{
      employeeId: string;
      employeeName: string;
      presentDays: number;
      absentDays: number;
      lateDays: number;
      totalHours: number;
    }> = [];

    for (const emp of employees) {
      const attendances = await this.getEmployeeAttendance(emp.id, startDate, endDate);

      stats.push({
        employeeId: emp.id,
        employeeName: emp.user ? `${emp.user.firstName} ${emp.user.lastName}` : emp.employeeNumber,
        presentDays: attendances.filter(a =>
          ['present', 'late', 'early_leave', 'partial'].includes(a.status)
        ).length,
        absentDays: attendances.filter(a => a.status === 'absent').length,
        lateDays: attendances.filter(a => a.status === 'late').length,
        totalHours: attendances
          .filter(a => a.actualHours)
          .reduce((sum, a) => sum + (a.actualHours ?? 0), 0),
      });
    }

    return stats;
  }

  /**
   * Get aggregated stats for the team (present, absent, late counts)
   */
  async getTeamStats(
    organizationId: string,
    departmentId?: string,
  ): Promise<{
    totalEmployees: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    averageHours: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all active employees
    const employeeQuery = this.employeeRepo
      .createQueryBuilder('e')
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.employmentStatus = :status', { status: 'active' });

    if (departmentId) {
      employeeQuery.andWhere('e.departmentId = :deptId', { deptId: departmentId });
    }

    const employees = await employeeQuery.getMany();
    const totalEmployees = employees.length;

    // Get today's attendance
    const todayAttendance = await this.attendanceRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.employee', 'e')
      .where('a.organizationId = :orgId', { orgId: organizationId })
      .andWhere('a.attendanceDate = :date', { date: today })
      .andWhere('a.deletedAt IS NULL')
      .getMany();

    const presentCount = todayAttendance.filter(a =>
      ['present', 'late', 'early_leave', 'partial'].includes(a.status)
    ).length;
    const absentCount = todayAttendance.filter(a => a.status === 'absent').length;
    const lateCount = todayAttendance.filter(a => a.status === 'late').length;

    // Calculate average hours for the current week
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
    weekStart.setHours(0, 0, 0, 0);

    const weekAttendance = await this.attendanceRepo
      .createQueryBuilder('a')
      .where('a.organizationId = :orgId', { orgId: organizationId })
      .andWhere('a.attendanceDate >= :weekStart', { weekStart })
      .andWhere('a.attendanceDate <= :today', { today })
      .andWhere('a.deletedAt IS NULL')
      .getMany();

    const totalHours = weekAttendance
      .filter(a => a.actualHours)
      .reduce((sum, a) => sum + (a.actualHours ?? 0), 0);
    const daysWithHours = weekAttendance.filter(a => a.actualHours).length;
    const averageHours = daysWithHours > 0 ? totalHours / daysWithHours : 0;

    return {
      totalEmployees,
      presentCount,
      absentCount,
      lateCount,
      averageHours: Math.round(averageHours * 10) / 10,
    };
  }


  /**
   * Get attendance history with filters
   * - For employees: only their own records
   * - For admins: all records with optional employeeId filter
   */
  async getAttendanceHistory(
    organizationId: string,
    filters: {
      employeeId?: string;
      startDate?: Date;
      endDate?: Date;
      statusType?: 'positive' | 'negative';
    },
  ): Promise<OfficeAttendance[]> {
    const query = this.attendanceRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.employee', 'e')
      .leftJoinAndSelect('e.user', 'u')
      .leftJoinAndSelect('e.department', 'd')
      .where('a.organizationId = :orgId', { orgId: organizationId })
      .andWhere('a.deletedAt IS NULL');

    if (filters.employeeId) {
      query.andWhere('a.employeeId = :employeeId', { employeeId: filters.employeeId });
    }

    if (filters.startDate) {
      query.andWhere('a.attendanceDate >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      query.andWhere('a.attendanceDate <= :endDate', { endDate: filters.endDate });
    }

    if (filters.statusType === 'positive') {
      // Present, on-time, good attendance
      query.andWhere('a.status IN (:...positiveStatuses)', { positiveStatuses: ['present', 'early_leave'] });
    } else if (filters.statusType === 'negative') {
      // Late, absent, partial
      query.andWhere('a.status IN (:...negativeStatuses)', { negativeStatuses: ['late', 'absent', 'partial'] });
    }

    query.orderBy('a.attendanceDate', 'DESC').addOrderBy('a.createdAt', 'DESC').limit(100);

    return query.getMany();
  }

  /**
   * Créer une entrée de pointage manuelle (admin)
   */
  async createManualEntry(
    organizationId: string,
    input: {
      employeeId: string;
      date: string;
      checkIn: string;
      checkOut?: string;
      notes?: string;
    },
  ): Promise<OfficeAttendance> {
    const attendanceDate = new Date(input.date);
    attendanceDate.setHours(0, 0, 0, 0);

    // Vérifier si un pointage existe déjà pour cette date
    const existing = await this.attendanceRepo.findOne({
      where: {
        employeeId: input.employeeId,
        attendanceDate,
      },
    });

    // Calculer le statut
    const employee = await this.employeeRepo.findOne({
      where: { id: input.employeeId },
    });

    const scheduledCheckIn = employee?.workStartTime || '09:00';
    const scheduled = this.timeToMinutes(scheduledCheckIn);
    const actual = this.timeToMinutes(input.checkIn);

    let status: AttendanceStatus = 'present';
    if (actual > scheduled) {
      status = 'late';
    }

    if (existing) {
      // Mettre à jour le pointage existant
      existing.actualCheckIn = input.checkIn;
      if (input.checkOut) {
        existing.actualCheckOut = input.checkOut;
        const checkInMinutes = this.timeToMinutes(input.checkIn);
        const checkOutMinutes = this.timeToMinutes(input.checkOut);
        existing.actualHours = Math.round((checkOutMinutes - checkInMinutes) / 60 * 100) / 100;
      }
      existing.status = status;
      if (input.notes) existing.notes = input.notes;
      return this.attendanceRepo.save(existing);
    }

    // Créer un nouveau pointage
    const attendance = this.attendanceRepo.create({
      employeeId: input.employeeId,
      organizationId,
      attendanceDate,
      scheduledCheckIn,
      scheduledCheckOut: employee?.workEndTime || '18:00',
      scheduledHours: 8,
      actualCheckIn: input.checkIn,
      actualCheckOut: input.checkOut || null,
      actualHours: input.checkOut
        ? Math.round((this.timeToMinutes(input.checkOut) - this.timeToMinutes(input.checkIn)) / 60 * 100) / 100
        : null,
      status,
      notes: input.notes || null,
    });

    return this.attendanceRepo.save(attendance);
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * L'employé travaille-t-il ce jour-là ?
   *
   * `work_days` est stocké en codes de 3 lettres (« mon,tue,wed,thu,fri »).
   * Quand la colonne est vide ou nulle, aucun planning n'a été défini : on
   * considère alors tous les jours comme travaillés, ce qui préserve le
   * comportement historique des employés sans horaire.
   *
   * Note : on lit le jour en heure locale du process, comme le reste de
   * `checkIn` qui calcule `currentTime` avec getHours(). Le serveur tourne en
   * UTC et les organisations sont en Africa/Lome (UTC+0), donc les deux
   * coïncident ; les garder sur la même base évite une incohérence interne.
   */
  private isWorkDay(workDays: string[] | null | undefined, date: Date): boolean {
    const codes = (workDays ?? [])
      .map((d) => String(d).trim().toLowerCase())
      .filter((d) => d.length > 0);
    if (codes.length === 0) return true;

    const DAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const today = DAY_CODES[date.getDay()];
    // Tolère les deux notations rencontrées en base : « mon » et « monday ».
    return codes.some((d) => d === today || d.startsWith(today));
  }

  // ────────── BIS-2 ──────────

  /**
   * Complète a posteriori un pointage de départ manquant. L'employé fournit
   * son heure estimée (HH:MM). On marque `is_estimated_checkout = true`
   * pour traçabilité (la RH peut distinguer les heures réelles des heures
   * déclarées sur honneur).
   *
   * Garde-fous :
   *   - L'attendance doit appartenir à l'employé
   *   - actual_check_out doit être NULL (pas de sur-écriture)
   *   - La date doit être hier ou avant (pas de modification d'un pointage futur)
   *   - L'heure estimée doit être > actual_check_in
   */
  async completeCheckout(
    employeeId: string,
    organizationId: string,
    input: { attendanceId: string; estimatedCheckOut: string; notes?: string | null },
  ): Promise<OfficeAttendance> {
    const attendance = await this.attendanceRepo.findOne({
      where: { id: input.attendanceId, employeeId, organizationId },
    });
    if (!attendance) {
      throw new NotFoundException('Pointage non trouvé');
    }
    if (attendance.actualCheckOut) {
      throw new BadRequestException('Le pointage de départ est déjà rempli');
    }
    if (!attendance.actualCheckIn) {
      throw new BadRequestException('Aucun pointage d\'arrivée à compléter');
    }

    // La date du pointage doit être hier ou avant.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const attDate = new Date(attendance.attendanceDate);
    attDate.setHours(0, 0, 0, 0);
    if (attDate >= today) {
      throw new BadRequestException(
        'Pointage du jour : utilisez le check-out normal, pas la complétion.',
      );
    }

    // Validation de l'heure estimée.
    if (!/^\d{2}:\d{2}$/.test(input.estimatedCheckOut)) {
      throw new BadRequestException('Heure invalide (format HH:MM attendu)');
    }
    const checkOutMin = this.timeToMinutes(input.estimatedCheckOut);
    const checkInMin = this.timeToMinutes(attendance.actualCheckIn);
    if (checkOutMin <= checkInMin) {
      throw new BadRequestException(
        'L\'heure de départ doit être postérieure à l\'heure d\'arrivée.',
      );
    }

    attendance.actualCheckOut = input.estimatedCheckOut;
    attendance.actualHours = Math.round(((checkOutMin - checkInMin) / 60) * 100) / 100;
    attendance.isEstimatedCheckout = true;

    // Recalcul du statut : si départ anticipé > 30min, status = early_leave.
    if (attendance.actualHours < (attendance.scheduledHours ?? 8) - 0.5) {
      attendance.status = 'early_leave';
    }

    if (input.notes) {
      attendance.notes = (attendance.notes ? attendance.notes + '\n' : '') +
        `[Complétion ${new Date().toISOString().slice(0, 10)}] ${input.notes}`;
    }

    return this.attendanceRepo.save(attendance);
  }

  /**
   * Retourne les jours incomplets d'un employé sur les `days` derniers jours.
   * Pour chaque jour, indique ce qui manque : pointage (check-out ou absence
   * totale), rapport journalier, réponses gardien. Permet à l'employé de voir
   * d'un coup d'œil ce qu'il doit compléter.
   *
   * Le SQL utilise `generate_series` pour énumérer TOUS les jours de la
   * fenêtre, puis LEFT JOIN office_attendances. Les jours sans ligne
   * apparaissent comme "absent total" (pas de pointage du tout). Sinon
   * ces jours seraient invisibles, ce qui est un trou de suivi RH critique.
   *
   * Filtres JS post-SQL :
   *   - on retire les jours hors workDays de l'employé
   *   - on retire les jours couverts par un congé approuvé
   *   - on ne renvoie que les jours avec au moins 1 missingItem
   */
  async getIncompleteForEmployee(
    organizationId: string,
    employeeId: string,
    days: number = 7,
  ): Promise<Array<{
    date: string;
    attendanceId: string | null;
    checkIn: string | null;
    checkOut: string | null;
    status: 'incomplete' | 'absent';
    isEstimatedCheckout: boolean;
    journalSubmitted: boolean;
    guardianQuestionsAnswered: boolean;
    missingItems: Array<'checkout' | 'journal' | 'guardian_questions'>;
  }>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since = new Date(today);
    since.setDate(since.getDate() - Math.max(1, Math.min(days, 30)));

    // Utiliser le format local (YYYY-MM-DD) et non toISOString() qui
    // retourne une date UTC — en UTC+2, minuit local = 22h UTC la
    // veille, ce qui décale todayIso d'un jour en arrière.
    const toLocalIso = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    const sinceIso = toLocalIso(since);
    const todayIso = toLocalIso(today);
    console.log('[getIncompleteForEmployee] employeeId:', employeeId, 'orgId:', organizationId, 'since:', sinceIso, 'today:', todayIso);

    // Récupère le profil employé pour connaître ses workDays.
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      console.log('[getIncompleteForEmployee] employee not found');
      return [];
    }
    console.log('[getIncompleteForEmployee] employee workDays:', employee.workDays);

    // Liste des congés approuvés couvrant la fenêtre. Permet d'exclure les
    // jours où l'employé est en congé légitime.
    const leaves: Array<{ start_date: string; end_date: string }> =
      await this.dataSource.query(
        `SELECT start_date::text, end_date::text
           FROM module_c_rh.leave_requests
          WHERE employee_id = $1
            AND status = 'approved'
            AND start_date <= $3
            AND end_date >= $2`,
        [employeeId, sinceIso, todayIso],
      );
    console.log('[getIncompleteForEmployee] approved leaves:', leaves.length, leaves);

    const isOnLeave = (iso: string): boolean =>
      leaves.some(l => iso >= l.start_date && iso <= l.end_date);

    // generate_series : énumère tous les jours de [since, today). Pour
    // chaque jour, LEFT JOIN office_attendances + daily_journals +
    // guardian_questions pour détecter ce qui manque, MÊME les jours sans
    // aucun pointage.
    const rows: Array<{
      date: string;
      attendance_id: string | null;
      check_in: string | null;
      check_out: string | null;
      is_estimated_checkout: boolean | null;
      journal_id: string | null;
      guardian_id: string | null;
    }> = await this.dataSource.query(
      `SELECT d::text AS date,
              oa.id AS attendance_id,
              oa.actual_check_in AS check_in,
              oa.actual_check_out AS check_out,
              oa.is_estimated_checkout,
              dj.id AS journal_id,
              gq.id AS guardian_id
         FROM generate_series($3::date, ($4::date - INTERVAL '1 day')::date, '1 day') AS d
         LEFT JOIN module_c_rh.office_attendances oa
           ON oa.employee_id = $1
          AND oa.organization_id = $2
          AND oa.attendance_date = d
          AND oa.deleted_at IS NULL
         LEFT JOIN module_c_rh.daily_journals dj
           ON dj.employee_id = $1 AND dj.journal_date = d
         LEFT JOIN module_c_rh.guardian_questions gq
           ON gq.employee_id = $1 AND gq.question_date = d
        ORDER BY d DESC`,
      [employeeId, organizationId, sinceIso, todayIso],
    );
    console.log('[getIncompleteForEmployee] raw rows:', rows.length, JSON.stringify(rows));

    const DAY_CODES = [
      'sunday', 'monday', 'tuesday', 'wednesday',
      'thursday', 'friday', 'saturday',
    ];
    const workDays = (employee.workDays ?? []).map(d => d.toLowerCase());

    return rows
      .map(r => {
        const dayDate = new Date(r.date);
        const dayCode = DAY_CODES[dayDate.getUTCDay()].slice(0, 3);
        // Si workDays est défini et ne contient pas ce jour → repos
        const isWorkDay = workDays.length === 0 || workDays.includes(dayCode);
        if (!isWorkDay) return null;
        // Si congé approuvé → non incomplet
        if (isOnLeave(r.date)) return null;

        const missing: Array<'checkout' | 'journal' | 'guardian_questions'> = [];
        // Pas de check-in du tout → on ne demande pas le check-out (pas
        // d'attendanceId pour l'appeler), mais on garde journal+gardien.
        if (r.check_in && !r.check_out) missing.push('checkout');
        if (!r.journal_id) missing.push('journal');
        if (!r.guardian_id) missing.push('guardian_questions');

        // Status : 'absent' si aucun check_in, sinon 'incomplete'.
        const status: 'incomplete' | 'absent' = !r.check_in ? 'absent' : 'incomplete';

        return {
          date: r.date,
          attendanceId: r.attendance_id,
          checkIn: r.check_in,
          checkOut: r.check_out,
          status,
          isEstimatedCheckout: !!r.is_estimated_checkout,
          journalSubmitted: !!r.journal_id,
          guardianQuestionsAnswered: !!r.guardian_id,
          missingItems: missing,
        };
      })
      // Garder uniquement les jours travaillés où il manque quelque chose.
      .filter((r): r is NonNullable<typeof r> => r !== null && r.missingItems.length > 0);
  }
}
