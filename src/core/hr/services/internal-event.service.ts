import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual, In } from 'typeorm';
import { InternalEvent, InternalEventType, InternalEventStatus } from '../entities/internal-event.entity';
import { Employee } from '../employee.entity';
import { InAppNotificationService } from '../../notifications/in-app-notification.service';
import { HrRealtimeService } from '../hr-realtime.service';

export interface CreateInternalEventInput {
  title: string;
  description?: string | null;
  eventType: InternalEventType;
  status?: InternalEventStatus;
  startDate: Date;
  endDate: Date;
  isAllDay?: boolean;
  location?: string | null;
  isRemote?: boolean;
  organizerId?: string | null;
  targetDepartments?: string[];
  targetEmployeeIds?: string[];
  isCompanyWide?: boolean;
  recurrenceType?: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | null;
  recurrenceEndDate?: Date | null;
  isVisible?: boolean;
  requiresRsvp?: boolean;
  attachments?: Array<{ name: string; url: string; type: string }>;
  color?: string;
}

export interface UpdateInternalEventInput {
  title?: string;
  description?: string | null;
  eventType?: InternalEventType;
  status?: InternalEventStatus;
  startDate?: Date;
  endDate?: Date;
  isAllDay?: boolean;
  location?: string | null;
  isRemote?: boolean;
  organizerId?: string | null;
  targetDepartments?: string[];
  targetEmployeeIds?: string[];
  isCompanyWide?: boolean;
  recurrenceType?: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | null;
  recurrenceEndDate?: Date | null;
  isVisible?: boolean;
  requiresRsvp?: boolean;
  attachments?: Array<{ name: string; url: string; type: string }>;
  color?: string;
}

export interface EventFilters {
  startDate?: Date;
  endDate?: Date;
  eventType?: InternalEventType;
  status?: InternalEventStatus;
  departmentId?: string;
  organizerId?: string;
  isCompanyWide?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class InternalEventService {
  private readonly logger = new Logger(InternalEventService.name);

  constructor(
    @InjectRepository(InternalEvent)
    private readonly eventRepo: Repository<InternalEvent>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly notificationService: InAppNotificationService,
    private readonly realtime: HrRealtimeService,
  ) { }

  /**
   * Créer un nouvel événement interne
   */
  async createEvent(
    organizationId: string,
    input: CreateInternalEventInput,
  ): Promise<InternalEvent> {
    // Valider les dates
    if (input.startDate >= input.endDate) {
      throw new BadRequestException('La date de début doit être antérieure à la date de fin');
    }

    const event = this.eventRepo.create({
      organizationId,
      title: input.title,
      description: input.description || null,
      eventType: input.eventType,
      status: input.status || 'DRAFT',
      startDate: input.startDate,
      endDate: input.endDate,
      isAllDay: input.isAllDay || false,
      location: input.location || null,
      isRemote: input.isRemote || false,
      organizerId: input.organizerId || null,
      targetDepartments: input.targetDepartments || [],
      targetEmployeeIds: input.targetEmployeeIds || [],
      isCompanyWide: input.isCompanyWide !== undefined ? input.isCompanyWide : true,
      recurrenceType: input.recurrenceType || null,
      recurrenceEndDate: input.recurrenceEndDate || null,
      isVisible: input.isVisible !== undefined ? input.isVisible : true,
      requiresRsvp: input.requiresRsvp || false,
      attachments: input.attachments || [],
      color: input.color || '#F09815',
    });

    return this.eventRepo.save(event);
  }

  /**
   * Mettre à jour un événement
   */
  async updateEvent(
    id: string,
    organizationId: string,
    input: UpdateInternalEventInput,
  ): Promise<InternalEvent> {
    const event = await this.eventRepo.findOne({
      where: { id, organizationId, deletedAt: null as any },
    });

    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    // Valider les dates si fournies
    const newStartDate = input.startDate || event.startDate;
    const newEndDate = input.endDate || event.endDate;
    if (newStartDate >= newEndDate) {
      throw new BadRequestException('La date de début doit être antérieure à la date de fin');
    }

    Object.assign(event, {
      ...input,
      targetDepartments: input.targetDepartments || event.targetDepartments,
      targetEmployeeIds: input.targetEmployeeIds || event.targetEmployeeIds,
      attachments: input.attachments || event.attachments,
    });

    return this.eventRepo.save(event);
  }

  /**
   * Supprimer un événement (soft delete)
   */
  async deleteEvent(id: string, organizationId: string): Promise<{ deleted: boolean }> {
    const event = await this.eventRepo.findOne({
      where: { id, organizationId, deletedAt: null as any },
    });

    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    event.deletedAt = new Date();
    await this.eventRepo.save(event);

    return { deleted: true };
  }

  /**
   * Récupérer un événement par ID
   */
  async getEventById(id: string, organizationId: string): Promise<InternalEvent> {
    const event = await this.eventRepo.findOne({
      where: { id, organizationId, deletedAt: null as any },
      relations: ['organizer'],
    });

    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    return event;
  }

  /**
   * Lister les événements avec filtres
   */
  async listEvents(organizationId: string, filters: EventFilters = {}) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

    const qb = this.eventRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.organizer', 'organizer')
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.deletedAt IS NULL');

    // Filtre par plage de dates
    if (filters.startDate && filters.endDate) {
      qb.andWhere(
        '(e.startDate >= :startFilter OR e.endDate <= :endFilter OR (e.startDate <= :startFilter AND e.endDate >= :endFilter))',
        { startFilter: filters.startDate, endFilter: filters.endDate }
      );
    } else if (filters.startDate) {
      qb.andWhere('e.endDate >= :startFilter', { startFilter: filters.startDate });
    } else if (filters.endDate) {
      qb.andWhere('e.startDate <= :endFilter', { endFilter: filters.endDate });
    }

    if (filters.eventType) {
      qb.andWhere('e.eventType = :eventType', { eventType: filters.eventType });
    }

    if (filters.status) {
      qb.andWhere('e.status = :status', { status: filters.status });
    }

    if (filters.organizerId) {
      qb.andWhere('e.organizerId = :organizerId', { organizerId: filters.organizerId });
    }

    if (filters.isCompanyWide !== undefined) {
      qb.andWhere('e.isCompanyWide = :isCompanyWide', { isCompanyWide: filters.isCompanyWide });
    }

    // Filtre par département
    if (filters.departmentId) {
      qb.andWhere(
        '(e.isCompanyWide = true OR :deptId = ANY(e.targetDepartments))',
        { deptId: filters.departmentId }
      );
    }

    qb.orderBy('e.startDate', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Récupérer les événements d'un mois pour le calendrier
   */
  async getCalendarEvents(
    organizationId: string,
    year: number,
    month: number,
    departmentId?: string,
    employeeId?: string,
  ): Promise<InternalEvent[]> {
    // Calculer le premier et dernier jour du mois
    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const qb = this.eventRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.organizer', 'organizer')
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.deletedAt IS NULL')
      .andWhere('e.isVisible = true')
      .andWhere('e.status IN (:...statuses)', { statuses: ['PUBLISHED', 'COMPLETED'] })
      .andWhere(
        '(e.startDate >= :startOfMonth AND e.startDate <= :endOfMonth) OR ' +
        '(e.endDate >= :startOfMonth AND e.endDate <= :endOfMonth) OR ' +
        '(e.startDate <= :startOfMonth AND e.endDate >= :endOfMonth)',
        { startOfMonth, endOfMonth }
      );

    // Filtre par département ou employé
    if (departmentId || employeeId) {
      qb.andWhere(
        '(e.isCompanyWide = true OR :deptId = ANY(e.targetDepartments) OR :empId = ANY(e.targetEmployeeIds))',
        { deptId: departmentId || null, empId: employeeId || null }
      );
    }

    return qb.orderBy('e.startDate', 'ASC').getMany();
  }

  /**
   * Récupérer les événements à venir
   */
  async getUpcomingEvents(
    organizationId: string,
    limit: number = 10,
    departmentId?: string,
    employeeId?: string,
  ): Promise<InternalEvent[]> {
    const now = new Date();

    const qb = this.eventRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.organizer', 'organizer')
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.deletedAt IS NULL')
      .andWhere('e.isVisible = true')
      .andWhere('e.status = :status', { status: 'PUBLISHED' })
      .andWhere('e.endDate >= :now', { now });

    if (departmentId || employeeId) {
      qb.andWhere(
        '(e.isCompanyWide = true OR :deptId = ANY(e.targetDepartments) OR :empId = ANY(e.targetEmployeeIds))',
        { deptId: departmentId || null, empId: employeeId || null }
      );
    }

    return qb.orderBy('e.startDate', 'ASC').take(limit).getMany();
  }

  /**
   * Publier un événement (changer le statut)
   */
  async publishEvent(id: string, organizationId: string): Promise<InternalEvent> {
    const event = await this.eventRepo.findOne({
      where: { id, organizationId, deletedAt: null as any },
    });

    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    const wasAlreadyPublished = event.status === 'PUBLISHED';
    event.status = 'PUBLISHED';
    const saved = await this.eventRepo.save(event);

    // Notifs aux participants ciblés (fire-and-forget, ne bloque pas).
    // Idempotent : on ne renvoie pas si l'événement était déjà publié.
    if (!wasAlreadyPublished) {
      void this.notifyParticipants(saved).catch(err => {
        this.logger.warn(`Notif participants événement ${saved.id} : ${err.message}`);
      });

      // Émission temps réel pour rafraîchir les calendriers/listes des
      // utilisateurs connectés (la notif gère le 1-à-1, ceci gère le live).
      this.realtime.emitEventPublished({
        organizationId: saved.organizationId,
        eventId: saved.id,
        title: saved.title,
        eventType: saved.eventType,
        startDate: saved.startDate,
        isCompanyWide: saved.isCompanyWide,
      });
    }

    return saved;
  }

  /**
   * Notifie les destinataires d'un événement publié.
   * Cibles :
   *   - isCompanyWide = true → tous les employés actifs de l'org
   *   - sinon → targetEmployeeIds + employés des targetDepartments
   * Dédoublonne avant envoi pour éviter les notifs en double.
   */
  private async notifyParticipants(event: InternalEvent): Promise<void> {
    const targetUserIds = new Set<string>();

    if (event.isCompanyWide) {
      const employees = await this.employeeRepo.find({
        where: { organizationId: event.organizationId, employmentStatus: 'active' },
        select: ['userId'],
      });
      for (const e of employees) {
        if (e.userId) targetUserIds.add(e.userId);
      }
    } else {
      // Employés explicitement ciblés
      const explicitIds = event.targetEmployeeIds ?? [];
      if (explicitIds.length > 0) {
        const employees = await this.employeeRepo.find({
          where: { id: In(explicitIds) },
          select: ['userId'],
        });
        for (const e of employees) {
          if (e.userId) targetUserIds.add(e.userId);
        }
      }
      // Employés des départements ciblés
      const deptIds = event.targetDepartments ?? [];
      if (deptIds.length > 0) {
        const employees = await this.employeeRepo.find({
          where: {
            organizationId: event.organizationId,
            departmentId: In(deptIds),
            employmentStatus: 'active',
          },
          select: ['userId'],
        });
        for (const e of employees) {
          if (e.userId) targetUserIds.add(e.userId);
        }
      }
    }

    if (targetUserIds.size === 0) {
      this.logger.debug(`Événement ${event.id} : aucun destinataire à notifier`);
      return;
    }

    const startDateStr = new Date(event.startDate).toLocaleString('fr-FR', {
      dateStyle: 'long',
      timeStyle: event.isAllDay ? undefined : 'short',
    });

    const title = event.requiresRsvp
      ? `📨 Invitation : ${event.title}`
      : `📅 Nouvel événement : ${event.title}`;

    const message =
      `${event.description ?? ''}\n` +
      `📍 ${event.location ?? (event.isRemote ? 'À distance' : 'Non précisé')}\n` +
      `🕐 ${startDateStr}`;

    await this.notificationService.createMany(
      Array.from(targetUserIds).map(userId => ({
        userId,
        organizationId: event.organizationId,
        type: event.requiresRsvp ? 'event_invitation' : 'event_published',
        title,
        message: message.trim(),
        data: {
          eventId: event.id,
          eventType: event.eventType,
          startDate: event.startDate,
          endDate: event.endDate,
          location: event.location,
          requiresRsvp: event.requiresRsvp,
        },
      })),
    );

    this.logger.log(
      `Événement ${event.id} publié → ${targetUserIds.size} notif(s) envoyée(s)`,
    );
  }

  /**
   * Annuler un événement
   */
  async cancelEvent(id: string, organizationId: string): Promise<InternalEvent> {
    const event = await this.eventRepo.findOne({
      where: { id, organizationId, deletedAt: null as any },
    });

    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    event.status = 'CANCELLED';
    const saved = await this.eventRepo.save(event);
    this.realtime.emitEventCancelled({
      organizationId: saved.organizationId,
      eventId: saved.id,
    });
    return saved;
  }

  /**
   * Marquer un événement comme terminé
   */
  async completeEvent(id: string, organizationId: string): Promise<InternalEvent> {
    const event = await this.eventRepo.findOne({
      where: { id, organizationId, deletedAt: null as any },
    });

    if (!event) {
      throw new NotFoundException('Événement non trouvé');
    }

    event.status = 'COMPLETED';
    return this.eventRepo.save(event);
  }

  /**
   * Récupérer les types d'événements disponibles
   */
  getEventTypes(): { value: InternalEventType; label: string }[] {
    return [
      { value: 'MEETING', label: 'Réunion' },
      { value: 'TRAINING', label: 'Formation' },
      { value: 'CELEBRATION', label: 'Célébration' },
      { value: 'ANNOUNCEMENT', label: 'Annonce' },
      { value: 'TEAM_BUILDING', label: 'Team Building' },
      { value: 'BIRTHDAY', label: 'Anniversaire' },
      { value: 'WORK_ANNIVERSARY', label: 'Anniversaire de travail' },
      { value: 'HOLIDAY', label: 'Jour férié' },
      { value: 'OTHER', label: 'Autre' },
    ];
  }

  /**
   * Récupérer les événements RH à venir (contrats et anniversaires)
   */
  async getUpcomingRhEvents(organizationId: string, daysAhead: number = 30): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const events: any[] = [];

    // Récupérer les employés actifs avec leurs données
    const employees = await this.employeeRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'user')
      .leftJoinAndSelect('e.department', 'department')
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.employmentStatus = :status', { status: 'active' })
      .getMany();

    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();

    for (const emp of employees) {
      const employeeName = emp.user
        ? `${emp.user.firstName} ${emp.user.lastName}`.trim()
        : emp.employeeNumber;

      // 1. Anniversaires de naissance (priorité: User.birthDate, sinon Employee.birthDate)
      const userBirthDate = emp.user?.birthDate || emp.birthDate;
      if (userBirthDate) {
        const birthDate = new Date(userBirthDate);
        const birthdayThisYear = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());

        // Si l'anniversaire est déjà passé cette année, prendre l'année prochaine
        let nextBirthday = birthdayThisYear;
        if (birthdayThisYear < today) {
          nextBirthday = new Date(currentYear + 1, birthDate.getMonth(), birthDate.getDate());
        }

        if (nextBirthday >= today && nextBirthday <= futureDate) {
          events.push({
            id: `birthday-${emp.id}-${nextBirthday.getFullYear()}`,
            type: 'BIRTHDAY',
            title: `Anniversaire de ${employeeName}`,
            date: nextBirthday,
            employeeId: emp.id,
            employeeName,
            department: emp.department?.name || null,
            description: `${employeeName} fête son anniversaire`,
            isAutoGenerated: true,
          });
        }
      }

      // 2. Débuts de contrat
      if (emp.contractStartDate) {
        const contractStart = new Date(emp.contractStartDate);
        const startAnniversary = new Date(currentYear, contractStart.getMonth(), contractStart.getDate());

        // Si l'anniversaire de début est déjà passé cette année, prendre l'année prochaine
        let nextStartAnniversary = startAnniversary;
        if (startAnniversary < today) {
          nextStartAnniversary = new Date(currentYear + 1, contractStart.getMonth(), contractStart.getDate());
        }

        if (nextStartAnniversary >= today && nextStartAnniversary <= futureDate) {
          const yearsOfService = nextStartAnniversary.getFullYear() - contractStart.getFullYear();
          events.push({
            id: `work-anniversary-${emp.id}-${nextStartAnniversary.getFullYear()}`,
            type: 'WORK_ANNIVERSARY',
            title: `${yearsOfService} an${yearsOfService > 1 ? 's' : ''} de ${employeeName}`,
            date: nextStartAnniversary,
            employeeId: emp.id,
            employeeName,
            department: emp.department?.name || null,
            description: `${employeeName} fête ses ${yearsOfService} ans dans l'entreprise`,
            isAutoGenerated: true,
          });
        }
      }

      // 3. Fins de contrat à venir
      if (emp.contractEndDate) {
        const contractEnd = new Date(emp.contractEndDate);
        if (contractEnd >= today && contractEnd <= futureDate) {
          events.push({
            id: `contract-end-${emp.id}`,
            type: 'CONTRACT_END',
            title: `Fin de contrat - ${employeeName}`,
            date: contractEnd,
            employeeId: emp.id,
            employeeName,
            department: emp.department?.name || null,
            description: `Le contrat de ${employeeName} se termine`,
            isAutoGenerated: true,
            isUrgent: true,
          });
        }
      }

      // 4. Fins de période d'essai
      if (emp.probationEndDate) {
        const probationEnd = new Date(emp.probationEndDate);
        if (probationEnd >= today && probationEnd <= futureDate) {
          events.push({
            id: `probation-end-${emp.id}`,
            type: 'PROBATION_END',
            title: `Fin d'essai - ${employeeName}`,
            date: probationEnd,
            employeeId: emp.id,
            employeeName,
            department: emp.department?.name || null,
            description: `Fin de période d'essai pour ${employeeName}`,
            isAutoGenerated: true,
          });
        }
      }
    }

    // Trier par date
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return events;
  }
}
