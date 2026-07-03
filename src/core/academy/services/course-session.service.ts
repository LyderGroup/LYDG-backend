import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseSession, SessionStatus } from '../entities/course-session.entity';

export interface CreateSessionInput {
  title: string;
  description?: string | null;
  courseId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  location?: string | null;
  instructor?: string | null;
  costPerParticipant?: number | null;
  currency?: string;
}

export type UpdateSessionInput = Partial<CreateSessionInput> & { status?: SessionStatus };

export interface ListSessionsOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: SessionStatus;
  courseId?: string;
  /** Catalogue apprenant : sessions inscriptibles (non annulées, non terminées). */
  enrollableOnly?: boolean;
}

const ACTIVE_STATUSES: SessionStatus[] = ['planned', 'open', 'in_progress'];

@Injectable()
export class CourseSessionService {
  private readonly logger = new Logger(CourseSessionService.name);

  constructor(
    @InjectRepository(CourseSession) private readonly repo: Repository<CourseSession>,
  ) {}

  /**
   * Le statut d'une session est DÉRIVÉ de ses dates — jamais saisi à la main.
   * Seule l'annulation (`cancelled`) est un override manuel, sticky.
   *
   *   now < début            → planned    (planifiée)
   *   début ≤ now ≤ fin       → in_progress (en cours)
   *   now > fin              → completed  (terminée)
   *   pas de date de début   → planned    (fallback)
   *
   * Les colonnes start_date / end_date sont de type `date` (YYYY-MM-DD), on
   * compare donc des chaînes de date pour éviter tout décalage de fuseau.
   */
  private todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private dateStr(v: Date | string | null | undefined): string | null {
    if (!v) return null;
    return typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
  }

  computePhase(startDate: Date | string | null, endDate: Date | string | null): SessionStatus {
    const today = this.todayStr();
    const start = this.dateStr(startDate);
    const end = this.dateStr(endDate);
    if (!start || start > today) return 'planned';
    if (end && end < today) return 'completed';
    return 'in_progress';
  }

  private withEffectiveStatus<T extends CourseSession>(session: T): T {
    if (session.status === 'cancelled') return session;
    return { ...session, status: this.computePhase(session.startDate, session.endDate) };
  }

  async findPage(organizationId: string, options: ListSessionsOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 20;

    const qb = this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.course', 'course')
      .leftJoinAndSelect('s.creator', 'creator')
      .where('s.organization_id = :orgId', { orgId: organizationId })
      .andWhere('s.deleted_at IS NULL');

    // Filtrage par phase : dérivé des dates (pas de la colonne `status`, qui ne
    // fait plus autorité que pour `cancelled`). `CURRENT_DATE` car colonnes `date`.
    const NOT_CANCELLED = "s.status <> 'cancelled'";
    const ENROLLABLE = `${NOT_CANCELLED} AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)`;
    if (options.enrollableOnly) {
      qb.andWhere(ENROLLABLE);
    } else if (options.status) {
      switch (options.status) {
        case 'cancelled':
          qb.andWhere("s.status = 'cancelled'");
          break;
        case 'completed':
          qb.andWhere(NOT_CANCELLED).andWhere('s.end_date IS NOT NULL AND s.end_date < CURRENT_DATE');
          break;
        case 'in_progress':
          qb.andWhere(NOT_CANCELLED)
            .andWhere('s.start_date IS NOT NULL AND s.start_date <= CURRENT_DATE')
            .andWhere('(s.end_date IS NULL OR s.end_date >= CURRENT_DATE)');
          break;
        case 'planned':
          qb.andWhere(NOT_CANCELLED).andWhere('(s.start_date IS NULL OR s.start_date > CURRENT_DATE)');
          break;
        case 'open': // alias legacy → inscriptibles (planifiées + en cours)
          qb.andWhere(ENROLLABLE);
          break;
      }
    }
    if (options.courseId) qb.andWhere('s.course_id = :cid', { cid: options.courseId });

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere('LOWER(s.title) LIKE :term', { term });
    }

    qb.orderBy('s.startDate', 'ASC')
      .addOrderBy('s.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items.map((s) => this.withEffectiveStatus(s)),
      meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 },
    };
  }

  async findOne(organizationId: string, id: string): Promise<CourseSession> {
    const session = await this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.course', 'course')
      .leftJoinAndSelect('s.creator', 'creator')
      .where('s.id = :id', { id })
      .andWhere('s.organization_id = :orgId', { orgId: organizationId })
      .andWhere('s.deleted_at IS NULL')
      .getOne();
    if (!session) throw new NotFoundException('Session introuvable');
    return this.withEffectiveStatus(session);
  }

  async create(organizationId: string, actorId: string | null, input: CreateSessionInput): Promise<CourseSession> {
    if (!input.title?.trim()) throw new BadRequestException('Le titre est obligatoire');
    if (input.startDate && input.endDate && input.endDate < input.startDate) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }

    const session = this.repo.create({
      organizationId,
      courseId: input.courseId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      location: input.location?.trim() || null,
      instructor: input.instructor?.trim() || null,
      costPerParticipant: input.costPerParticipant ?? null,
      currency: input.currency ?? 'XOF',
      // Statut dérivé des dates dès la création (plus de "passer à open").
      status: this.computePhase(input.startDate ?? null, input.endDate ?? null),
      createdBy: actorId,
    });
    return this.repo.save(session);
  }

  async update(organizationId: string, id: string, input: UpdateSessionInput): Promise<CourseSession> {
    const session = await this.findOne(organizationId, id);

    if (input.title !== undefined) session.title = input.title.trim();
    if (input.description !== undefined) session.description = input.description?.trim() || null;
    if (input.courseId !== undefined) session.courseId = input.courseId;
    if (input.startDate !== undefined) session.startDate = input.startDate;
    if (input.endDate !== undefined) session.endDate = input.endDate;
    if (input.location !== undefined) session.location = input.location?.trim() || null;
    if (input.instructor !== undefined) session.instructor = input.instructor?.trim() || null;
    if (input.costPerParticipant !== undefined) session.costPerParticipant = input.costPerParticipant;
    if (input.currency) session.currency = input.currency;

    if (session.startDate && session.endDate && session.endDate < session.startDate) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }

    // Statut : seul `cancelled` est un override manuel (sticky). Toute autre
    // valeur — ou un changement de dates — déclenche le recalcul depuis les dates.
    session.status =
      input.status === 'cancelled'
        ? 'cancelled'
        : this.computePhase(session.startDate, session.endDate);

    return this.repo.save(session);
  }

  async softDelete(organizationId: string, id: string): Promise<void> {
    await this.findOne(organizationId, id);
    await this.repo.update({ id }, { deletedAt: new Date() } as any);
  }

  /**
   * Tâche planifiée — auto-complète les sessions dont la date de fin est dépassée.
   * Tourne toutes les nuits à 01h00.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async autoCompletePastSessions(): Promise<void> {
    try {
      const result = await this.repo
        .createQueryBuilder()
        .update(CourseSession)
        .set({ status: 'completed' })
        .where('end_date IS NOT NULL')
        .andWhere('end_date < CURRENT_DATE')
        .andWhere('status IN (:...active)', { active: ACTIVE_STATUSES })
        .andWhere('deleted_at IS NULL')
        .execute();

      if (result.affected && result.affected > 0) {
        this.logger.log(`Auto-complétion : ${result.affected} session(s) marquée(s) comme terminée(s).`);
      }
    } catch (err) {
      this.logger.error('Échec de l\'auto-complétion des sessions', err as Error);
    }
  }
}
