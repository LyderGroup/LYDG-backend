import { BadRequestException, Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { DailyJournal } from '../entities/daily-journal.entity';
import { Employee } from '../employee.entity';
import { HrRealtimeService } from '../hr-realtime.service';
import { InAppNotificationService } from '../../notifications/in-app-notification.service';
import { FcmService } from '../../notifications/fcm.service';

interface SubmitJournalInput {
  employeeId: string;
  accomplishments?: string;
  challenges?: string;
  learnings?: string;
  tomorrowPlan?: string;
  mood?: string;
  productivityScore?: number;
  /** YYYY-MM-DD pour soumettre un journal pour un jour passé (max 7 jours). */
  date?: string;
}

interface ReviewJournalInput {
  journalId: string;
  reviewedBy: string;
  feedback?: string;
}

@Injectable()
export class DailyJournalService {
  private readonly logger = new Logger(DailyJournalService.name);

  constructor(
    @InjectRepository(DailyJournal)
    private readonly repo: Repository<DailyJournal>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly realtime: HrRealtimeService,
    private readonly inApp: InAppNotificationService,
    private readonly fcm: FcmService,
  ) { }

  async submitJournal(input: SubmitJournalInput): Promise<DailyJournal> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // BIS-2 : permettre la soumission pour un jour passé (max 7 jours en
    // arrière). Le lock 24h ne s'applique que pour le journal du jour même.
    const targetDate = input.date ? new Date(input.date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    if (targetDate.getTime() > today.getTime()) {
      throw new BadRequestException(
        'Impossible de soumettre un rapport pour une date future',
      );
    }
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (targetDate.getTime() < sevenDaysAgo.getTime()) {
      throw new BadRequestException(
        'Impossible de soumettre un rapport de plus de 7 jours.',
      );
    }
    const isToday = targetDate.getTime() === today.getTime();

    // Check if already exists for the target date
    let journal = await this.repo.findOne({
      where: {
        employeeId: input.employeeId,
        journalDate: targetDate,
      },
    });

    if (journal) {
      // Lock 24h uniquement pour le journal du jour même. Les journaux
      // d'un jour passé peuvent être édités tant qu'ils sont dans la
      // fenêtre des 7 jours.
      if (isToday) {
        const hoursSinceCreation =
          (Date.now() - new Date(journal.createdAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceCreation > 24) {
          throw new ForbiddenException(
            'Ce journal ne peut plus être modifié (délai de 24h dépassé)',
          );
        }
      }

      // Update existing
      journal.accomplishments = input.accomplishments ?? journal.accomplishments;
      journal.challenges = input.challenges ?? journal.challenges;
      journal.learnings = input.learnings ?? journal.learnings;
      journal.tomorrowPlan = input.tomorrowPlan ?? journal.tomorrowPlan;
      journal.mood = input.mood ?? journal.mood;
      journal.productivityScore = input.productivityScore ?? journal.productivityScore;
      journal.isSubmitted = true;
      journal.submittedAt = new Date();
      const saved = await this.repo.save(journal);
      void this.emitSubmitted(saved);
      return saved;
    }

    // Create new
    journal = this.repo.create({
      employeeId: input.employeeId,
      journalDate: targetDate,
      accomplishments: input.accomplishments ?? null,
      challenges: input.challenges ?? null,
      learnings: input.learnings ?? null,
      tomorrowPlan: input.tomorrowPlan ?? null,
      mood: input.mood ?? null,
      productivityScore: input.productivityScore ?? null,
      isSubmitted: true,
      submittedAt: new Date(),
    });
    const created = await this.repo.save(journal);
    void this.emitSubmitted(created);
    return created;
  }

  /** Émet l'événement journal.submitted en temps réel. Best-effort. */
  private async emitSubmitted(journal: DailyJournal): Promise<void> {
    try {
      const emp = await this.employeeRepo.findOne({
        where: { id: journal.employeeId },
        select: ['userId', 'organizationId'],
      });
      if (!emp?.organizationId) return;
      const dateStr = journal.journalDate instanceof Date
        ? journal.journalDate.toISOString().slice(0, 10)
        : String(journal.journalDate).slice(0, 10);
      this.realtime.emitJournalSubmitted({
        organizationId: emp.organizationId,
        journalId: journal.id,
        employeeId: journal.employeeId,
        journalDate: dateStr,
        userId: emp.userId,
      });
    } catch {
      // best-effort
    }
  }

  async getTodayJournal(employeeId: string): Promise<DailyJournal | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.repo.findOne({
      where: {
        employeeId,
        journalDate: today,
      },
    });
  }

  async getEmployeeJournals(
    employeeId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<DailyJournal[]> {
    const query = this.repo
      .createQueryBuilder('dj')
      .where('dj.employee_id = :employeeId', { employeeId })
      .orderBy('dj.journal_date', 'DESC');

    if (startDate && endDate) {
      query.andWhere('dj.journal_date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    return query.getMany();
  }

  async reviewJournal(input: ReviewJournalInput): Promise<DailyJournal> {
    const journal = await this.repo.findOne({
      where: { id: input.journalId },
    });

    if (!journal) {
      throw new Error('Journal non trouvé');
    }

    journal.reviewedBy = input.reviewedBy;
    journal.reviewedAt = new Date();
    journal.managerFeedback = input.feedback ?? null;

    const saved = await this.repo.save(journal);

    // Émission temps réel + notifications (bell in-app + Web Push) — best-effort
    try {
      const emp = await this.employeeRepo.findOne({
        where: { id: saved.employeeId },
        select: ['userId', 'organizationId'],
      });
      if (emp?.organizationId) {
        this.realtime.emitJournalReviewed({
          organizationId: emp.organizationId,
          journalId: saved.id,
          employeeId: saved.employeeId,
          employeeUserId: emp.userId,
          feedback: saved.managerFeedback,
        });

        if (emp.userId) {
          const preview = (saved.managerFeedback ?? '').trim().slice(0, 140);
          const title = 'Feedback reçu sur votre journal';
          const message = preview
            ? `Votre manager a laissé un commentaire : « ${preview}${preview.length === 140 ? '…' : ''} »`
            : 'Votre manager a relu votre journal.';
          const data = {
            journalId: saved.id,
            employeeId: saved.employeeId,
            reviewedBy: input.reviewedBy,
          };

          // 1. Notification persistée + Socket.IO (cloche)
          this.inApp
            .create({
              userId: emp.userId,
              organizationId: emp.organizationId,
              type: 'journal_feedback',
              title,
              message,
              data,
            })
            .catch((e) => this.logger.warn(`In-app notification failed: ${e?.message ?? e}`));

          // 2. Web Push (FCM) — déclenche le toast "WhatsApp Web style" même
          //    si l'utilisateur n'est pas sur l'onglet.
          this.fcm
            .sendToUser(emp.userId, title, message, {
              type: 'journal_feedback',
              journalId: saved.id,
            })
            .catch((e) => this.logger.warn(`FCM push failed: ${e?.message ?? e}`));
        }
      }
    } catch (e) {
      this.logger.warn(`Notification dispatch failed: ${(e as Error)?.message ?? e}`);
    }

    return saved;
  }

  async getTeamJournals(
    organizationId: string,
    options?: { date?: Date; all?: boolean; limit?: number },
  ): Promise<DailyJournal[]> {
    const qb = this.repo
      .createQueryBuilder('dj')
      .innerJoinAndSelect('dj.employee', 'emp')
      .leftJoinAndSelect('emp.user', 'user')
      .where('emp.organization_id = :organizationId', { organizationId });

    if (!options?.all) {
      // Mode filtré par date (défaut). On compare en YYYY-MM-DD car
      // journal_date est un type DATE — évite les soucis de fuseau.
      const target = options?.date ? new Date(options.date) : new Date();
      target.setHours(0, 0, 0, 0);
      const dateStr = target.toISOString().slice(0, 10);
      qb.andWhere('dj.journal_date = :dateStr', { dateStr });
    } else {
      // Mode "tout afficher" : plafond pour ne pas charger trop de lignes.
      qb.take(options?.limit ?? 200);
    }

    return qb
      // orderBy : propriétés camelCase (TypeORM crash sinon sur certains joins).
      // En mode "all", on trie par date du journal (plus récents en haut) puis
      // par submittedAt. En mode filtré par date, le 1er tri n'a aucun effet.
      .orderBy('dj.journalDate', 'DESC')
      .addOrderBy('dj.submittedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('dj.createdAt', 'DESC')
      .getMany();
  }

  async getMonthlyStats(employeeId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const journals = await this.repo.find({
      where: {
        employeeId,
        journalDate: Between(startDate, endDate),
        isSubmitted: true,
      },
    });

    const totalDays = journals.length;
    const avgProductivity =
      journals.reduce((sum, j) => sum + (j.productivityScore || 0), 0) /
      (totalDays || 1);

    // Mood distribution
    const moodCounts: Record<string, number> = {};
    journals.forEach((j) => {
      if (j.mood) {
        moodCounts[j.mood] = (moodCounts[j.mood] || 0) + 1;
      }
    });

    return {
      totalDays,
      avgProductivity: Math.round(avgProductivity * 10) / 10,
      moodDistribution: moodCounts,
      journals,
    };
  }
}
