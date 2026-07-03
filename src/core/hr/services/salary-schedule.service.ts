import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { SalarySchedule, SalaryPayment, SalaryFrequency } from '../entities/salary-schedule.entity';
import { Employee } from '../employee.entity';

export interface CreateScheduleInput {
  employeeId: string;
  payDay: number;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  frequency?: SalaryFrequency;
  customInterval?: number;
  notes?: string;
}

export interface UpdateScheduleInput {
  payDay?: number;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  frequency?: SalaryFrequency;
  customInterval?: number;
  isActive?: boolean;
  notes?: string;
}

export interface CalendarEvent {
  id: string;
  date: Date;
  type: 'scheduled' | 'paid' | 'failed';
  employeeId: string;
  employeeName: string;
  amount: number;
  currency: string;
  status: string;
}

@Injectable()
export class SalaryScheduleService {
  constructor(
    @InjectRepository(SalarySchedule)
    private readonly scheduleRepo: Repository<SalarySchedule>,
    @InjectRepository(SalaryPayment)
    private readonly paymentRepo: Repository<SalaryPayment>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) { }

  /**
   * Créer une planification de salaire
   */
  async createSchedule(
    organizationId: string,
    createdBy: string,
    input: CreateScheduleInput,
  ): Promise<SalarySchedule> {
    // Vérifier que l'employé existe et appartient à l'organisation
    const employee = await this.employeeRepo.findOne({
      where: { id: input.employeeId, organizationId },
    });

    if (!employee) {
      throw new NotFoundException('Employé non trouvé');
    }

    // Valider le jour de paie
    if (input.payDay < 1 || input.payDay > 31) {
      throw new BadRequestException('Le jour de paie doit être entre 1 et 31');
    }

    // Désactiver les anciens schedules actifs
    await this.scheduleRepo.update(
      { employeeId: input.employeeId, isActive: true },
      { isActive: false },
    );

    const schedule = this.scheduleRepo.create({
      employeeId: input.employeeId,
      organizationId,
      payDay: input.payDay,
      effectiveFrom: input.effectiveFrom || new Date(),
      effectiveTo: input.effectiveTo || null,
      frequency: input.frequency || 'monthly',
      customInterval: input.customInterval || null,
      notes: input.notes || null,
      createdBy,
      isActive: true,
    });

    return this.scheduleRepo.save(schedule);
  }

  /**
   * Mettre à jour une planification
   */
  async updateSchedule(
    id: string,
    organizationId: string,
    input: UpdateScheduleInput,
  ): Promise<SalarySchedule> {
    const schedule = await this.scheduleRepo.findOne({
      where: { id, organizationId, deletedAt: null as any },
    });

    if (!schedule) {
      throw new NotFoundException('Planification non trouvée');
    }

    if (input.payDay !== undefined) {
      if (input.payDay < 1 || input.payDay > 31) {
        throw new BadRequestException('Le jour de paie doit être entre 1 et 31');
      }
      schedule.payDay = input.payDay;
    }

    if (input.effectiveFrom !== undefined) schedule.effectiveFrom = input.effectiveFrom;
    if (input.effectiveTo !== undefined) schedule.effectiveTo = input.effectiveTo;
    if (input.frequency !== undefined) schedule.frequency = input.frequency;
    if (input.customInterval !== undefined) schedule.customInterval = input.customInterval;
    if (input.isActive !== undefined) schedule.isActive = input.isActive;
    if (input.notes !== undefined) schedule.notes = input.notes;

    return this.scheduleRepo.save(schedule);
  }

  /**
   * Supprimer une planification (soft delete)
   */
  async deleteSchedule(id: string, organizationId: string): Promise<{ deleted: boolean }> {
    const schedule = await this.scheduleRepo.findOne({
      where: { id, organizationId },
    });

    if (!schedule) {
      throw new NotFoundException('Planification non trouvée');
    }

    schedule.deletedAt = new Date();
    schedule.isActive = false;
    await this.scheduleRepo.save(schedule);

    return { deleted: true };
  }

  /**
   * Récupérer la planification d'un employé
   */
  async getEmployeeSchedule(employeeId: string, organizationId: string): Promise<SalarySchedule | null> {
    return this.scheduleRepo.findOne({
      where: { employeeId, organizationId, isActive: true, deletedAt: null as any },
      relations: ['employee', 'employee.user'],
    });
  }

  /**
   * Lister toutes les planifications d'une organisation
   */
  async listSchedules(organizationId: string): Promise<SalarySchedule[]> {
    return this.scheduleRepo.find({
      where: { organizationId, deletedAt: null as any },
      relations: ['employee', 'employee.user', 'employee.department'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Générer les paiements pour un mois donné
   */
  async generateMonthlyPayments(organizationId: string, year: number, month: number): Promise<SalaryPayment[]> {
    const schedules = await this.scheduleRepo.find({
      where: { organizationId, isActive: true, deletedAt: null as any },
      relations: ['employee'],
    });

    const payments: SalaryPayment[] = [];

    for (const schedule of schedules) {
      // Calculer la date de paie pour ce mois
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const payDay = Math.min(schedule.payDay, lastDayOfMonth);
      const scheduledDate = new Date(year, month - 1, payDay);

      // Vérifier si un paiement existe déjà pour cette date
      const existing = await this.paymentRepo.findOne({
        where: {
          employeeId: schedule.employeeId,
          scheduledDate: scheduledDate,
        },
      });

      if (!existing) {
        const payment = this.paymentRepo.create({
          scheduleId: schedule.id,
          employeeId: schedule.employeeId,
          organizationId,
          scheduledDate,
          amount: schedule.employee.baseSalary || 0,
          currency: schedule.employee.salaryCurrency || 'XOF',
          status: 'scheduled',
        });
        payments.push(await this.paymentRepo.save(payment));
      }
    }

    return payments;
  }

  /**
   * Marquer un paiement comme effectué
   */
  async markPaymentPaid(
    paymentId: string,
    organizationId: string,
    processedBy: string,
    transactionRef?: string,
  ): Promise<SalaryPayment> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId, organizationId },
    });

    if (!payment) {
      throw new NotFoundException('Paiement non trouvé');
    }

    payment.status = 'paid';
    payment.paidDate = new Date();
    payment.processedBy = processedBy;
    if (transactionRef) payment.transactionRef = transactionRef;

    return this.paymentRepo.save(payment);
  }

  /**
   * Récupérer les événements du calendrier pour un mois
   * Génère automatiquement les jours de paie depuis les planifications actives
   */
  async getCalendarEvents(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<CalendarEvent[]> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);
    const events: CalendarEvent[] = [];

    // 1. Récupérer les paiements déjà générés pour ce mois
    const payments = await this.paymentRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .where('payment.organizationId = :orgId', { orgId: organizationId })
      .andWhere('payment.scheduledDate >= :start', { start: startOfMonth })
      .andWhere('payment.scheduledDate <= :end', { end: endOfMonth })
      .orderBy('payment.scheduledDate', 'ASC')
      .getMany();

    // Ajouter les paiements existants
    for (const payment of payments) {
      events.push({
        id: payment.id,
        date: payment.scheduledDate,
        type: payment.status === 'paid' ? 'paid' : payment.status === 'failed' ? 'failed' : 'scheduled',
        employeeId: payment.employeeId,
        employeeName: payment.employee?.user
          ? `${payment.employee.user.firstName} ${payment.employee.user.lastName}`.trim()
          : 'N/A',
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
      });
    }

    // 2. Générer automatiquement depuis les planifications actives
    const schedules = await this.scheduleRepo
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .where('schedule.organizationId = :orgId', { orgId: organizationId })
      .andWhere('schedule.isActive = true')
      .andWhere('schedule.deletedAt IS NULL')
      .getMany();

    const lastDayOfMonth = new Date(year, month, 0).getDate();

    for (const schedule of schedules) {
      // Calculer le jour de paie pour ce mois
      const payDay = Math.min(schedule.payDay, lastDayOfMonth);
      const scheduledDate = new Date(year, month - 1, payDay);

      // Vérifier si la date est dans la période de validité
      const effectiveFrom = new Date(schedule.effectiveFrom);
      const effectiveTo = schedule.effectiveTo ? new Date(schedule.effectiveTo) : null;

      // La date est valide si:
      // - Elle est après effectiveFrom
      // - Et (effectiveTo est null OU elle est avant effectiveTo)
      if (scheduledDate >= effectiveFrom && (!effectiveTo || scheduledDate <= effectiveTo)) {
        // Vérifier si un événement existe déjà pour cet employé à cette date
        const existingEvent = events.find(
          (e) => e.employeeId === schedule.employeeId &&
            new Date(e.date).toDateString() === scheduledDate.toDateString()
        );

        if (!existingEvent && schedule.employee) {
          events.push({
            id: `auto-${schedule.id}-${year}-${month}`,
            date: scheduledDate,
            type: 'scheduled',
            employeeId: schedule.employeeId,
            employeeName: schedule.employee.user
              ? `${schedule.employee.user.firstName} ${schedule.employee.user.lastName}`.trim()
              : 'N/A',
            amount: Number(schedule.employee.baseSalary) || 0,
            currency: schedule.employee.salaryCurrency || 'XOF',
            status: 'scheduled',
          });
        }
      }
    }

    // Trier par date
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return events;
  }

  /**
   * Lister les paiements avec filtres
   */
  async listPayments(
    organizationId: string,
    filters?: {
      employeeId?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const limit = filters?.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

    const qb = this.paymentRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('employee.department', 'department')
      .where('payment.organizationId = :orgId', { orgId: organizationId });

    if (filters?.employeeId) {
      qb.andWhere('payment.employeeId = :empId', { empId: filters.employeeId });
    }

    if (filters?.status) {
      qb.andWhere('payment.status = :status', { status: filters.status });
    }

    if (filters?.startDate) {
      qb.andWhere('payment.scheduledDate >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      qb.andWhere('payment.scheduledDate <= :endDate', { endDate: filters.endDate });
    }

    const [data, total] = await qb
      .orderBy('payment.scheduledDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: data.map((p) => ({
        id: p.id,
        scheduledDate: p.scheduledDate,
        paidDate: p.paidDate,
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status,
        transactionRef: p.transactionRef,
        employeeId: p.employeeId,
        employeeName: p.employee?.user
          ? `${p.employee.user.firstName} ${p.employee.user.lastName}`.trim()
          : 'N/A',
        department: p.employee?.department?.name || null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
