import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  CompanyRitual,
  RitualOccurrence,
  RitualParticipant,
  RitualType,
  RitualStatus,
} from '../entities/company-ritual.entity';
import { Employee } from '../employee.entity';

interface CreateRitualInput {
  organizationId: string;
  name: string;
  description?: string;
  ritualType: RitualType;
  scheduledTime?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  durationMinutes?: number;
  participantRoles?: string[];
  checklistItems?: string[];
  isMandatory?: boolean;
}

interface CreateOccurrenceInput {
  ritualId: string;
  occurrenceDate: Date;
  notes?: string;
}

@Injectable()
export class CompanyRitualService {
  private readonly logger = new Logger(CompanyRitualService.name);

  constructor(
    @InjectRepository(CompanyRitual)
    private readonly ritualRepo: Repository<CompanyRitual>,
    @InjectRepository(RitualOccurrence)
    private readonly occurrenceRepo: Repository<RitualOccurrence>,
    @InjectRepository(RitualParticipant)
    private readonly participantRepo: Repository<RitualParticipant>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  // Create a new ritual template
  async createRitual(input: CreateRitualInput): Promise<CompanyRitual> {
    const ritual = this.ritualRepo.create({
      organizationId: input.organizationId,
      name: input.name,
      description: input.description ?? null,
      ritualType: input.ritualType,
      scheduledTime: input.scheduledTime ?? null,
      dayOfWeek: input.dayOfWeek ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      durationMinutes: input.durationMinutes ?? 15,
      participantRoles: input.participantRoles ? JSON.stringify(input.participantRoles) : null,
      checklistItems: input.checklistItems ? JSON.stringify(input.checklistItems) : null,
      isMandatory: input.isMandatory ?? true,
      isActive: true,
    });
    return this.ritualRepo.save(ritual);
  }

  // Get all rituals for an organization
  async getRituals(organizationId: string, type?: RitualType): Promise<CompanyRitual[]> {
    const query = this.ritualRepo
      .createQueryBuilder('r')
      .where('r.organization_id = :organizationId', { organizationId })
      .andWhere('r.is_active = :isActive', { isActive: true });

    if (type) {
      query.andWhere('r.ritual_type = :type', { type });
    }

    return query.orderBy('r.scheduledTime', 'ASC').getMany();
  }

  // Create default LiveYDream rituals
  async createDefaultRituals(organizationId: string): Promise<CompanyRitual[]> {
    const defaultRituals: CreateRitualInput[] = [
      // Daily rituals
      {
        organizationId,
        name: 'Morning Stand-up',
        description: 'Chaque matin, 8h30, 10 min max. Toute l\'équipe debout répond à 3 questions: Ce que j\'ai fait hier. Ce que je fais aujourd\'hui. Ce qui me bloque.',
        ritualType: RitualType.DAILY,
        scheduledTime: '08:30',
        durationMinutes: 10,
        participantRoles: ['EMPLOYEE'],
        checklistItems: ['Ce que j\'ai fait hier', 'Ce que je fais aujourd\'hui', 'Ce qui me bloque'],
        isMandatory: true,
      },
      {
        organizationId,
        name: 'Journal de Bord',
        description: 'Fin de journée, obligatoire. Chaque membre inscrit la liste de tout ce qu\'il a accompli dans sa journée.',
        ritualType: RitualType.DAILY,
        scheduledTime: '17:30',
        durationMinutes: 15,
        participantRoles: ['EMPLOYEE'],
        isMandatory: true,
      },
      {
        organizationId,
        name: 'Fermeture du QG',
        description: 'Dernière personne à partir: ventilateurs et climatisations éteints, lumières éteintes, machines débranchées, stores fermés, portes principales closes à clé.',
        ritualType: RitualType.DAILY,
        scheduledTime: '18:30',
        durationMinutes: 5,
        checklistItems: ['Ventilateurs/climatisations éteints', 'Lumières éteintes', 'Machines débranchées', 'Stores fermés', 'Portes closes à clé'],
        isMandatory: true,
      },
      // Weekly rituals
      {
        organizationId,
        name: 'Weekly Review',
        description: 'Vendredi 16h, 45 min. Les Chefs d\'équipe et le CEO font le bilan de la semaine: KPIs, clients, problèmes, victoires.',
        ritualType: RitualType.WEEKLY,
        scheduledTime: '16:00',
        dayOfWeek: 5, // Friday
        durationMinutes: 45,
        participantRoles: ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'MANAGER'],
        checklistItems: ['Revue KPIs', 'Bilan clients', 'Problèmes identifiés', 'Victoires de la semaine'],
        isMandatory: true,
      },
      {
        organizationId,
        name: 'Moment de Gratitude',
        description: 'Vendredi, fin de journée. Un court moment où chaque membre reconnaît publiquement un collègue qui l\'a aidé, inspiré ou impressionné cette semaine.',
        ritualType: RitualType.WEEKLY,
        scheduledTime: '17:00',
        dayOfWeek: 5,
        durationMinutes: 15,
        participantRoles: ['EMPLOYEE'],
        isMandatory: true,
      },
      // Monthly rituals
      {
        organizationId,
        name: 'Monthly Strategy',
        description: '1er lundi du mois, 2h. Management + CEO: bilan financier, bilan clients, bilan RH, stratégie du mois à venir.',
        ritualType: RitualType.MONTHLY,
        scheduledTime: '09:00',
        dayOfMonth: 1,
        durationMinutes: 120,
        participantRoles: ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'MANAGER'],
        checklistItems: ['Bilan financier', 'Bilan clients', 'Bilan RH', 'Stratégie du mois'],
        isMandatory: true,
      },
      {
        organizationId,
        name: 'Cérémonie de l\'Excellence',
        description: 'Fin de mois. Récompenser publiquement: le Membre du Mois (performance), la Meilleure Idée du Mois (innovation), le Meilleur Esprit d\'Équipe (fraternité).',
        ritualType: RitualType.MONTHLY,
        scheduledTime: '17:00',
        dayOfMonth: 28,
        durationMinutes: 30,
        participantRoles: ['EMPLOYEE'],
        checklistItems: ['Membre du Mois', 'Meilleure Idée du Mois', 'Meilleur Esprit d\'Équipe'],
        isMandatory: true,
      },
      {
        organizationId,
        name: 'Vendange des Erreurs',
        description: 'Mensuelle. L\'équipe analyse collectivement les échecs et erreurs du mois — sans blâme, uniquement pour apprendre. Chaque erreur doit produire une amélioration de processus.',
        ritualType: RitualType.MONTHLY,
        scheduledTime: '14:00',
        dayOfMonth: 15,
        durationMinutes: 60,
        participantRoles: ['EMPLOYEE'],
        checklistItems: ['Erreurs identifiées', 'Leçons apprises', 'Améliorations proposées'],
        isMandatory: true,
      },
      // Quarterly rituals
      {
        organizationId,
        name: 'Quarterly Innovation',
        description: 'Chaque trimestre, demi-journée. Toute l\'équipe. Brainstorming, revue des SOP, propositions d\'amélioration, nouvelles offres.',
        ritualType: RitualType.QUARTERLY,
        scheduledTime: '09:00',
        durationMinutes: 240,
        participantRoles: ['EMPLOYEE'],
        checklistItems: ['Brainstorming', 'Revue SOP', 'Propositions d\'amélioration', 'Nouvelles offres'],
        isMandatory: true,
      },
      // Yearly rituals
      {
        organizationId,
        name: 'Fête du Mouvement',
        description: 'Anniversaire annuel de LiveYDream. Célébration de l\'année écoulée: bilan, victoires, reconnaissance, projection pour l\'année suivante.',
        ritualType: RitualType.YEARLY,
        scheduledTime: '18:00',
        durationMinutes: 180,
        participantRoles: ['EMPLOYEE'],
        checklistItems: ['Bilan de l\'année', 'Victoires célébrées', 'Reconnaissance', 'Projection année suivante'],
        isMandatory: true,
      },
    ];

    const created: CompanyRitual[] = [];
    for (const input of defaultRituals) {
      const existing = await this.ritualRepo.findOne({
        where: { organizationId, name: input.name },
      });
      if (!existing) {
        const ritual = await this.createRitual(input);
        created.push(ritual);
      }
    }
    return created;
  }

  // Create an occurrence for a ritual
  async createOccurrence(input: CreateOccurrenceInput): Promise<RitualOccurrence> {
    const ritual = await this.ritualRepo.findOne({
      where: { id: input.ritualId },
    });
    if (!ritual) {
      throw new Error('Ritual not found');
    }

    const occurrence = this.occurrenceRepo.create({
      ritualId: input.ritualId,
      occurrenceDate: input.occurrenceDate,
      status: RitualStatus.SCHEDULED,
      notes: input.notes ?? null,
      attendees: null,
      absentees: null,
    });
    return this.occurrenceRepo.save(occurrence);
  }

  // Generate occurrences for upcoming rituals
  async generateUpcomingOccurrences(organizationId: string, daysAhead: number = 30): Promise<RitualOccurrence[]> {
    const rituals = await this.getRituals(organizationId);
    const occurrences: RitualOccurrence[] = [];
    const now = new Date();

    for (const ritual of rituals) {
      const dates = this.calculateOccurrenceDates(ritual, now, daysAhead);
      for (const date of dates) {
        // Check if occurrence already exists
        const existing = await this.occurrenceRepo.findOne({
          where: { ritualId: ritual.id, occurrenceDate: date },
        });
        if (!existing) {
          const occurrence = await this.createOccurrence({
            ritualId: ritual.id,
            occurrenceDate: date,
          });
          occurrences.push(occurrence);
        }
      }
    }
    return occurrences;
  }

  // Calculate occurrence dates for a ritual
  private calculateOccurrenceDates(ritual: CompanyRitual, startDate: Date, daysAhead: number): Date[] {
    const dates: Date[] = [];
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysAhead);

    switch (ritual.ritualType) {
      case RitualType.DAILY:
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          if (d.getDay() !== 0 && d.getDay() !== 6) { // Skip weekends
            dates.push(new Date(d));
          }
        }
        break;
      case RitualType.WEEKLY:
        if (ritual.dayOfWeek !== null) {
          for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            if (d.getDay() === ritual.dayOfWeek) {
              dates.push(new Date(d));
            }
          }
        }
        break;
      case RitualType.MONTHLY:
        if (ritual.dayOfMonth !== null) {
          const currentMonth = startDate.getMonth();
          const nextMonth = new Date(startDate.getFullYear(), currentMonth + 1, ritual.dayOfMonth);
          if (nextMonth <= endDate) {
            dates.push(nextMonth);
          }
        }
        break;
      case RitualType.QUARTERLY:
        // First day of each quarter
        const quarterMonths = [0, 3, 6, 9];
        for (const month of quarterMonths) {
          const date = new Date(startDate.getFullYear(), month, 1);
          if (date >= startDate && date <= endDate) {
            dates.push(date);
          }
        }
        break;
      case RitualType.YEARLY:
        // Anniversary date - placeholder
        const anniversary = new Date(startDate.getFullYear(), 0, 15); // Jan 15 as example
        if (anniversary >= startDate && anniversary <= endDate) {
          dates.push(anniversary);
        }
        break;
    }
    return dates;
  }

  // Get today's rituals
  async getTodayRituals(organizationId: string): Promise<(RitualOccurrence & { ritual: CompanyRitual })[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const occurrences = await this.occurrenceRepo
      .createQueryBuilder('o')
      .innerJoinAndSelect('o.ritual', 'r')
      .where('r.organization_id = :organizationId', { organizationId })
      .andWhere('o.occurrence_date >= :today', { today })
      .andWhere('o.occurrence_date < :tomorrow', { tomorrow })
      .orderBy('r.scheduledTime', 'ASC')
      .getMany();

    return occurrences as any[];
  }

  // Get upcoming rituals for an employee
  async getUpcomingForEmployee(employeeId: string, daysAhead: number = 7): Promise<any[]> {
    const employee = await this.employeeRepo.findOne({ where: { id: employeeId } });
    if (!employee) return [];

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + daysAhead);

    const occurrences = await this.occurrenceRepo
      .createQueryBuilder('o')
      .innerJoinAndSelect('o.ritual', 'r')
      .where('r.organization_id = :organizationId', { organizationId: employee.organizationId })
      .andWhere('o.occurrence_date >= :now', { now })
      .andWhere('o.occurrence_date <= :endDate', { endDate })
      .andWhere('o.status != :cancelled', { cancelled: RitualStatus.CANCELLED })
      .orderBy('o.occurrenceDate', 'ASC')
      .addOrderBy('r.scheduled_time', 'ASC')
      .getMany();

    return occurrences.map(o => ({
      ...o,
      ritual: o.ritual,
    }));
  }

  // Mark attendance
  async markAttendance(occurrenceId: string, employeeId: string, isPresent: boolean, contribution?: string): Promise<RitualParticipant> {
    let participant = await this.participantRepo.findOne({
      where: { occurrenceId, employeeId },
    });

    if (!participant) {
      participant = this.participantRepo.create({
        occurrenceId,
        employeeId,
        isPresent,
        contribution: contribution ?? null,
      });
    } else {
      participant.isPresent = isPresent;
      participant.contribution = contribution ?? null;
    }

    return this.participantRepo.save(participant);
  }

  // Start a ritual occurrence
  async startOccurrence(occurrenceId: string): Promise<RitualOccurrence> {
    const occurrence = await this.occurrenceRepo.findOne({ where: { id: occurrenceId } });
    if (!occurrence) throw new Error('Occurrence not found');

    occurrence.status = RitualStatus.IN_PROGRESS;
    occurrence.actualStartTime = new Date().toTimeString().slice(0, 5);
    return this.occurrenceRepo.save(occurrence);
  }

  // Complete a ritual occurrence
  async completeOccurrence(occurrenceId: string, notes?: string): Promise<RitualOccurrence> {
    const occurrence = await this.occurrenceRepo.findOne({ where: { id: occurrenceId } });
    if (!occurrence) throw new Error('Occurrence not found');

    occurrence.status = RitualStatus.COMPLETED;
    occurrence.actualEndTime = new Date().toTimeString().slice(0, 5);
    if (notes) occurrence.notes = notes;
    return this.occurrenceRepo.save(occurrence);
  }

  // Get ritual stats
  async getRitualStats(organizationId: string, ritualId?: string): Promise<any> {
    const query = this.occurrenceRepo
      .createQueryBuilder('o')
      .innerJoin('o.ritual', 'r')
      .where('r.organization_id = :organizationId', { organizationId });

    if (ritualId) {
      query.andWhere('o.ritual_id = :ritualId', { ritualId });
    }

    const occurrences = await query.getMany();

    const total = occurrences.length;
    const completed = occurrences.filter(o => o.status === RitualStatus.COMPLETED).length;
    const inProgress = occurrences.filter(o => o.status === RitualStatus.IN_PROGRESS).length;
    const scheduled = occurrences.filter(o => o.status === RitualStatus.SCHEDULED).length;

    return {
      total,
      completed,
      inProgress,
      scheduled,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
    };
  }
}
