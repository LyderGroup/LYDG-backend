import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseEnrollment, EnrollmentStatus } from '../entities/course-enrollment.entity';
import { Course } from '../entities/course.entity';
import { CourseSession } from '../entities/course-session.entity';

export interface CreateEnrollmentInput {
  courseId?: string | null;
  sessionId?: string | null;
  employeeId?: string | null;
  userId?: string | null;
  status?: EnrollmentStatus;
}

export interface SelfEnrollInput {
  courseId?: string | null;
  sessionId?: string | null;
}

export interface UpdateEnrollmentInput {
  status?: EnrollmentStatus;
}

export interface ListEnrollmentsOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: EnrollmentStatus;
  courseId?: string;
  employeeId?: string;
}

@Injectable()
export class EnrollmentService {
  constructor(
    @InjectRepository(CourseEnrollment) private readonly repo: Repository<CourseEnrollment>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(CourseSession) private readonly sessions: Repository<CourseSession>,
  ) {}

  /**
   * Liste les inscriptions de l'apprenant courant (employé OU user public).
   */
  async findMine(
    organizationId: string,
    learner: { employeeId?: string | null; userId?: string | null },
  ) {
    if (!learner.employeeId && !learner.userId) {
      return { data: [], meta: { total: 0 } };
    }

    const qb = this.repo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.course', 'course')
      .leftJoinAndSelect('e.session', 'session')
      .where('e.organization_id = :orgId', { orgId: organizationId })
      .andWhere('e.deleted_at IS NULL');

    if (learner.employeeId) {
      qb.andWhere('e.employee_id = :eid', { eid: learner.employeeId });
    } else if (learner.userId) {
      qb.andWhere('e.user_id = :uid', { uid: learner.userId });
    }

    qb.orderBy('e.enrollmentDate', 'DESC');

    const items = await qb.getMany();
    return { data: items, meta: { total: items.length } };
  }

  /**
   * Auto-inscription : l'apprenant courant s'inscrit à un cours OU à une session.
   * Vérifie : cours publié / session ouverte, anti-doublon, capacité.
   */
  async selfEnroll(
    organizationId: string,
    learner: { employeeId?: string | null; userId?: string | null },
    input: SelfEnrollInput,
  ): Promise<CourseEnrollment> {
    if (!learner.employeeId && !learner.userId) {
      throw new ForbiddenException('Identité apprenant non résolue');
    }
    if (!input.courseId && !input.sessionId) {
      throw new BadRequestException('Sélectionnez un cours ou une session');
    }

    let resolvedCourseId: string | null = input.courseId ?? null;

    // Validation session
    if (input.sessionId) {
      const session = await this.sessions.findOne({
        where: { id: input.sessionId, organizationId },
      });
      if (!session || session.deletedAt) throw new BadRequestException('Session introuvable');
      // Inscriptible = non annulée ET date de fin non dépassée. Cohérent avec le
      // statut dérivé des dates (plus de notion de statut "open" stocké).
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const endStr = session.endDate
        ? (typeof session.endDate === 'string'
            ? (session.endDate as string).slice(0, 10)
            : session.endDate.toISOString().slice(0, 10))
        : null;
      if (session.status === 'cancelled') {
        throw new ForbiddenException('Cette session est annulée');
      }
      if (endStr && endStr < todayStr) {
        throw new ForbiddenException('Cette session est terminée');
      }
      // Si la session est rattachée à un cours, on hérite courseId
      if (session.courseId) resolvedCourseId = session.courseId;
    }

    // Validation cours
    if (resolvedCourseId) {
      const course = await this.courses.findOne({
        where: { id: resolvedCourseId, organizationId },
      });
      if (!course || course.deletedAt) throw new BadRequestException('Cours introuvable');
      if (course.status !== 'published') {
        throw new ForbiddenException("Seuls les cours publiés acceptent des inscriptions");
      }
    }

    // Anti-doublon : (apprenant, cours OU session)
    const conflictQb = this.repo
      .createQueryBuilder('e')
      .where('e.organization_id = :orgId', { orgId: organizationId })
      .andWhere('e.deleted_at IS NULL');
    if (learner.employeeId) conflictQb.andWhere('e.employee_id = :eid', { eid: learner.employeeId });
    else conflictQb.andWhere('e.user_id = :uid', { uid: learner.userId });
    if (input.sessionId) {
      conflictQb.andWhere('e.session_id = :sid', { sid: input.sessionId });
    } else if (resolvedCourseId) {
      conflictQb.andWhere('e.course_id = :cid AND e.session_id IS NULL', { cid: resolvedCourseId });
    }
    const exists = await conflictQb.getOne();
    if (exists) throw new BadRequestException('Vous êtes déjà inscrit');

    const entity = this.repo.create({
      organizationId,
      courseId: resolvedCourseId,
      sessionId: input.sessionId ?? null,
      employeeId: learner.employeeId ?? null,
      userId: learner.userId ?? null,
      enrolledBy: learner.userId ?? null,
      status: 'enrolled',
    });
    return this.repo.save(entity);
  }

  /**
   * L'apprenant marque SA propre inscription comme terminée (bouton "Terminé").
   * Vérifie que l'inscription lui appartient (employee_id OU user_id).
   */
  async completeMine(
    organizationId: string,
    learner: { employeeId?: string | null; userId?: string | null },
    enrollmentId: string,
  ): Promise<CourseEnrollment> {
    if (!learner.employeeId && !learner.userId) {
      throw new ForbiddenException('Identité apprenant non résolue');
    }

    const enrollment = await this.repo.findOne({
      where: { id: enrollmentId, organizationId },
    });
    if (!enrollment || enrollment.deletedAt) {
      throw new NotFoundException('Inscription introuvable');
    }

    // Garde-fou : on ne complète que SA propre inscription.
    const ownsByEmployee = learner.employeeId && enrollment.employeeId === learner.employeeId;
    const ownsByUser = learner.userId && enrollment.userId === learner.userId;
    if (!ownsByEmployee && !ownsByUser) {
      throw new ForbiddenException("Cette inscription n'est pas la vôtre");
    }

    if (enrollment.status === 'cancelled' || enrollment.status === 'failed') {
      throw new BadRequestException("Cette inscription n'est pas active");
    }
    if (enrollment.status === 'completed') {
      return enrollment; // idempotent
    }

    await this.repo.update(
      { id: enrollment.id },
      { status: 'completed', completionDate: new Date() } as any,
    );
    return this.findOne(organizationId, enrollment.id);
  }

  async findPage(organizationId: string, options: ListEnrollmentsOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 25;

    const qb = this.repo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.course', 'course')
      .leftJoinAndSelect('e.session', 'session')
      .leftJoinAndSelect('e.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'employeeUser')
      .leftJoinAndSelect('e.user', 'user')
      .where('e.organization_id = :orgId', { orgId: organizationId })
      .andWhere('e.deleted_at IS NULL');

    if (options.status) qb.andWhere('e.status = :status', { status: options.status });
    if (options.courseId) qb.andWhere('e.course_id = :cid', { cid: options.courseId });
    if (options.employeeId) qb.andWhere('e.employee_id = :eid', { eid: options.employeeId });

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(course.title) LIKE :term OR LOWER(COALESCE(employeeUser.first_name, \'\')) LIKE :term OR LOWER(COALESCE(employeeUser.last_name, \'\')) LIKE :term OR LOWER(COALESCE(user.first_name, \'\')) LIKE :term OR LOWER(COALESCE(user.last_name, \'\')) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('e.enrollmentDate', 'DESC').skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items,
      meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 },
    };
  }

  async findOne(organizationId: string, id: string): Promise<CourseEnrollment> {
    const enrollment = await this.repo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.course', 'course')
      .leftJoinAndSelect('e.session', 'session')
      .leftJoinAndSelect('e.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'employeeUser')
      .leftJoinAndSelect('e.user', 'user')
      .where('e.id = :id', { id })
      .andWhere('e.organization_id = :orgId', { orgId: organizationId })
      .andWhere('e.deleted_at IS NULL')
      .getOne();
    if (!enrollment) throw new NotFoundException('Inscription introuvable');
    return enrollment;
  }

  async create(organizationId: string, actorId: string | null, input: CreateEnrollmentInput): Promise<CourseEnrollment> {
    if (!input.employeeId && !input.userId) {
      throw new BadRequestException('Sélectionnez un employé ou un utilisateur');
    }
    if (input.employeeId && input.userId) {
      throw new BadRequestException('Renseignez soit un employé, soit un utilisateur, pas les deux');
    }
    if (!input.courseId) {
      throw new BadRequestException('Sélectionnez un cours');
    }

    // Vérifie que le cours est publié (on n'autorise pas l'inscription à un draft)
    const course = await this.courses.findOne({
      where: { id: input.courseId, organizationId },
    });
    if (!course || course.deletedAt) throw new BadRequestException('Cours introuvable');
    if (course.status !== 'published') {
      throw new ForbiddenException("Seuls les cours publiés acceptent des inscriptions");
    }

    // Anti-doublon sur (course, employee) ou (course, user)
    const conflictQb = this.repo
      .createQueryBuilder('e')
      .where('e.course_id = :cid', { cid: input.courseId })
      .andWhere('e.deleted_at IS NULL');
    if (input.employeeId) conflictQb.andWhere('e.employee_id = :eid', { eid: input.employeeId });
    else conflictQb.andWhere('e.user_id = :uid', { uid: input.userId });
    const exists = await conflictQb.getOne();
    if (exists) {
      throw new BadRequestException('Cet apprenant est déjà inscrit à ce cours');
    }

    const entity = this.repo.create({
      organizationId,
      courseId: input.courseId,
      employeeId: input.employeeId ?? null,
      userId: input.userId ?? null,
      enrolledBy: actorId,
      status: input.status ?? 'enrolled',
      createdBy: actorId,
      updatedBy: actorId,
    });
    return this.repo.save(entity);
  }

  async update(organizationId: string, id: string, actorId: string | null, input: UpdateEnrollmentInput): Promise<CourseEnrollment> {
    const enrollment = await this.findOne(organizationId, id);

    const patch: Partial<CourseEnrollment> = { updatedBy: actorId };

    if (input.status) {
      patch.status = input.status;
      if (input.status === 'completed' && !enrollment.completionDate) {
        patch.completionDate = new Date();
      }
      if (input.status === 'cancelled' || input.status === 'failed') {
        patch.completionDate = null;
      }
    }

    await this.repo.update({ id }, patch as any);
    return this.findOne(organizationId, id);
  }

  async softDelete(organizationId: string, id: string, actorId: string | null): Promise<void> {
    const enrollment = await this.findOne(organizationId, id);
    await this.repo.update(
      { id: enrollment.id },
      { deletedAt: new Date(), status: 'cancelled', updatedBy: actorId } as any,
    );
  }
}
