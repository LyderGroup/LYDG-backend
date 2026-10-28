import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, QueryDeepPartialEntity, Repository } from 'typeorm';
import { JobPosition } from '../entities/job-position.entity';
import { EmployeePosition } from '../entities/employee-position.entity';

interface CreateJobPositionInput {
  organizationId?: string | null;
  departmentId?: string | null;
  name?: string | null;
  title: string;
  /** Facultatif : derive du nom quand il n'est pas fourni. */
  code?: string | null;
  description?: string | null;
  responsibilities?: string | null;
  isTeamLead?: boolean;
  isDepartmentHead?: boolean;
  isProjectLead?: boolean;
  isHrDirector?: boolean;
  jobFamily?: string | null;
  jobLevel?: string | null;
  salaryGrade?: string | null;
  minSalary?: number | null;
  maxSalary?: number | null;
  isActive?: boolean;
}

type UpdateJobPositionInput = Partial<Omit<CreateJobPositionInput, 'organizationId'>>;

interface ListJobPositionsOptions {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  isActive?: boolean;
}

@Injectable()
export class JobPositionService {
  constructor(
    @InjectRepository(JobPosition)
    private readonly repo: Repository<JobPosition>,
    @InjectRepository(EmployeePosition)
    private readonly assignments: Repository<EmployeePosition>,
  ) { }

  // ── Code automatique ──────────────────────────────────────────────────────

  private slugify(value: string): string {
    return (value ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'POSTE';
  }

  /** Unique dans la filiale (index uq_job_positions_org_code). */
  private async generateCode(organizationId: string, source: string): Promise<string> {
    const base = this.slugify(source);
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const taken = await this.repo.findOne({
        where: { organizationId, code: candidate, deletedAt: IsNull() } as any,
      });
      if (!taken) return candidate;
    }
    return `${base}-${Date.now().toString().slice(-5)}`;
  }

  // ── Postes ────────────────────────────────────────────────────────────────

  async findPage(organizationId: string, options: ListJobPositionsOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 20;

    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.department', 'department')
      .where('p.organization_id = :orgId', { orgId: organizationId })
      // La suppression est douce : sans ce filtre, un poste supprime
      // continuait d'apparaitre.
      .andWhere('p.deleted_at IS NULL');

    if (options.isActive !== undefined) {
      qb.andWhere('p.is_active = :active', { active: options.isActive });
    }
    if (options.departmentId) {
      qb.andWhere('p.department_id = :deptId', { deptId: options.departmentId });
    }
    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(p.title) LIKE :term OR LOWER(p.code) LIKE :term OR LOWER(COALESCE(p.name, '')) LIKE :term)",
        { term },
      );
    }

    qb.orderBy('p.title', 'ASC').skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    // Nombre de titulaires actuels : utile a l'affichage, et pour savoir si un
    // poste peut etre retire sans consequence.
    const counts = items.length
      ? ((await this.assignments
          .createQueryBuilder('a')
          .select('a.position_id', 'positionId')
          .addSelect('COUNT(*)', 'n')
          .where('a.position_id IN (:...ids)', { ids: items.map((p) => p.id) })
          .andWhere('a.ended_at IS NULL')
          .groupBy('a.position_id')
          .getRawMany()) as Array<{ positionId: string; n: string }>)
      : [];
    const byId = new Map(counts.map((c) => [c.positionId, Number(c.n)]));

    return {
      data: items.map((p) => Object.assign(p, { holdersCount: byId.get(p.id) ?? 0 })),
      meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 },
    };
  }

  async findOne(organizationId: string, id: string) {
    return this.repo.findOne({
      where: { id, organizationId, deletedAt: IsNull() } as any,
      relations: ['department'],
    });
  }

  async create(organizationId: string, input: CreateJobPositionInput) {
    if (!input.title?.trim()) throw new BadRequestException('Le titre du poste est obligatoire');

    const code = input.code?.trim()
      ? input.code.trim()
      : await this.generateCode(organizationId, input.name?.trim() || input.title);

    const entity = this.repo.create({
      organizationId,
      departmentId: input.departmentId ?? null,
      name: input.name?.trim() || null,
      title: input.title.trim(),
      code,
      description: input.description ?? null,
      responsibilities: input.responsibilities ?? null,
      isTeamLead: !!input.isTeamLead,
      isDepartmentHead: !!input.isDepartmentHead,
      isProjectLead: !!input.isProjectLead,
      isHrDirector: !!input.isHrDirector,
      jobFamily: input.jobFamily ?? null,
      jobLevel: input.jobLevel ?? null,
      salaryGrade: input.salaryGrade ?? null,
      minSalary: input.minSalary ?? null,
      maxSalary: input.maxSalary ?? null,
      isActive: input.isActive ?? true,
    });
    return this.repo.save(entity);
  }

  async update(organizationId: string, id: string, input: UpdateJobPositionInput) {
    const patch: QueryDeepPartialEntity<JobPosition> = {};
    if (input.departmentId !== undefined) patch.departmentId = input.departmentId;
    if (input.name !== undefined) patch.name = input.name?.trim() || null;
    if (input.title?.trim()) patch.title = input.title.trim();
    // Le code reste stable a l'edition : c'est une reference.
    if (input.code?.trim()) patch.code = input.code.trim();
    if (input.description !== undefined) patch.description = input.description;
    if (input.responsibilities !== undefined) patch.responsibilities = input.responsibilities;
    if (input.isTeamLead !== undefined) patch.isTeamLead = !!input.isTeamLead;
    if (input.isDepartmentHead !== undefined) patch.isDepartmentHead = !!input.isDepartmentHead;
    if (input.isProjectLead !== undefined) patch.isProjectLead = !!input.isProjectLead;
    if (input.isHrDirector !== undefined) patch.isHrDirector = !!input.isHrDirector;
    if (input.jobFamily !== undefined) patch.jobFamily = input.jobFamily;
    if (input.jobLevel !== undefined) patch.jobLevel = input.jobLevel;
    if (input.salaryGrade !== undefined) patch.salaryGrade = input.salaryGrade;
    if (input.minSalary !== undefined) patch.minSalary = input.minSalary;
    if (input.maxSalary !== undefined) patch.maxSalary = input.maxSalary;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    if (Object.keys(patch).length === 0) return this.findOne(organizationId, id);

    await this.repo.update({ id, organizationId }, patch);
    return this.findOne(organizationId, id);
  }

  /**
   * Suppression DOUCE. Un DELETE echouait des qu'un poste avait ete attribue
   * (cle etrangere) et aurait efface l'historique des affectations. Un poste
   * encore occupe ne peut pas etre retire.
   */
  async delete(organizationId: string, id: string) {
    const held = await this.assignments.count({
      where: { positionId: id, endedAt: IsNull() },
    });
    if (held > 0) {
      throw new BadRequestException(
        `Ce poste est occupé par ${held} collaborateur(s). Retirez-le-leur avant de le supprimer.`,
      );
    }
    await this.repo.update({ id, organizationId }, { deletedAt: new Date(), isActive: false });
    return { deleted: true };
  }

  // ── Affectations ──────────────────────────────────────────────────────────

  /** Postes d'un collaborateur : actuels d'abord, puis l'historique. */
  async listForEmployee(organizationId: string, employeeId: string) {
    return this.assignments
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.position', 'position')
      .where('a.employee_id = :employeeId', { employeeId })
      .andWhere('a.organization_id = :organizationId', { organizationId })
      .orderBy('a.ended_at IS NULL', 'DESC')
      .addOrderBy('a.is_primary', 'DESC')
      .addOrderBy('a.started_at', 'DESC')
      .getMany();
  }

  /**
   * Fixe l'ensemble des postes ACTUELS d'un collaborateur.
   * Les postes retires sont clos (ended_at), jamais supprimes ; les nouveaux
   * sont ouverts ; ceux qui restent gardent leur date de debut.
   */
  async setForEmployee(
    organizationId: string,
    employeeId: string,
    positionIds: string[],
    primaryPositionId: string | null,
    assignedBy: string | null,
  ) {
    const wanted = Array.from(new Set((positionIds ?? []).filter(Boolean)));

    if (wanted.length) {
      const valid = await this.repo.find({
        where: { id: In(wanted), organizationId, deletedAt: IsNull() } as any,
        select: ['id'] as any,
      });
      if (valid.length !== wanted.length) {
        throw new NotFoundException('Un ou plusieurs postes sont introuvables dans cette filiale');
      }
    }

    const current = await this.assignments.find({
      where: { employeeId, organizationId, endedAt: IsNull() },
    });
    const currentIds = new Set(current.map((a) => a.positionId));
    const now = new Date();

    const toEnd = current.filter((a) => !wanted.includes(a.positionId)).map((a) => a.id);
    if (toEnd.length) {
      await this.assignments.update({ id: In(toEnd) }, { endedAt: now, isPrimary: false });
    }

    const toOpen = wanted.filter((id) => !currentIds.has(id));
    if (toOpen.length) {
      await this.assignments.save(
        toOpen.map((positionId) =>
          this.assignments.create({
            organizationId,
            employeeId,
            positionId,
            isPrimary: false,
            startedAt: now,
            endedAt: null,
            assignedBy,
          }),
        ),
      );
    }

    // Un seul poste principal ; par defaut le premier de la liste.
    const primary =
      primaryPositionId && wanted.includes(primaryPositionId) ? primaryPositionId : wanted[0] ?? null;
    await this.assignments.update(
      { employeeId, organizationId, endedAt: IsNull() },
      { isPrimary: false },
    );
    if (primary) {
      await this.assignments.update(
        { employeeId, organizationId, positionId: primary, endedAt: IsNull() },
        { isPrimary: true },
      );
    }

    return this.listForEmployee(organizationId, employeeId);
  }

  /**
   * Manager RH d'une filiale : le titulaire ACTUEL d'un poste marque DRH.
   * Calcule a la lecture, jamais stocke : quand le DRH change, tous les
   * collaborateurs suivent sans mise a jour de masse. Null si personne
   * n'occupe ce poste.
   */
  async resolveHrDirector(organizationId: string): Promise<{ employeeId: string; name: string } | null> {
    const rows = (await this.repo.manager.query(
      `
      SELECT e.id AS employee_id,
             TRIM(COALESCE(e.first_name, u.first_name, '') || ' ' || COALESCE(e.last_name, u.last_name, '')) AS name
      FROM module_c_rh.employee_positions a
      JOIN module_c_rh.job_positions p ON p.id = a.position_id
      JOIN module_c_rh.employees e     ON e.id = a.employee_id
      LEFT JOIN core.users u           ON u.id = e.user_id
      WHERE a.organization_id = $1
        AND a.ended_at IS NULL
        AND p.is_hr_director = true
        AND p.deleted_at IS NULL
        AND e.employment_status = 'active'
      ORDER BY a.is_primary DESC, a.started_at ASC
      LIMIT 1
      `,
      [organizationId],
    )) as Array<{ employee_id: string; name: string }>;

    const r = rows[0];
    return r ? { employeeId: r.employee_id, name: r.name?.trim() || '—' } : null;
  }
}
