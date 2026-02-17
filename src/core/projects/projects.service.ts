import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type QueryDeepPartialEntity } from 'typeorm';
import { Organization } from '../organizations/organizations.entity';
import { UserRole } from '../rbac/user-role.entity';
import { ProjectMember } from './project-member.entity';
import { Project } from './project.entity';
import { Subtask } from './subtask.entity';
import { TaskComment } from './task-comment.entity';
import { Task } from './task.entity';
import { TaskCommentsRealtimeService } from './task-comments.realtime';

export type ControlTowerBucket = 'overdue' | 'pending_validation' | 'in_progress' | 'completed';

type TaskReadScope = 'own' | 'project' | 'team' | 'department' | 'tenant' | 'global';
type TaskWriteScope = 'own' | 'project' | 'team' | 'department' | 'tenant' | 'global';
type TaskDeleteScope = 'own' | 'project' | 'tenant' | 'global';
type TaskValidateScope = 'project' | 'team' | 'department' | 'tenant' | 'global';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
    @InjectRepository(Subtask)
    private readonly subtasksRepo: Repository<Subtask>,
    @InjectRepository(TaskComment)
    private readonly taskCommentsRepo: Repository<TaskComment>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>, 
    @InjectRepository(ProjectMember)
    private readonly projectMembersRepo: Repository<ProjectMember>,
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
    private readonly taskCommentsRealtime: TaskCommentsRealtimeService,
  ) {}

  private async recalcProjectProgressFromTasks(input: {
    projectId: string;
    contextOrganizationId: string;
  }): Promise<number> {
    const rows = (await this.projectsRepo.manager.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COALESCE(AVG(t.progress), 0)::float AS avg
      FROM module_b_projects.tasks t
      WHERE t.project_id = $1
        AND t.organization_id = $2
      `,
      [input.projectId, input.contextOrganizationId],
    )) as Array<{ total?: number; avg?: number }>;

    const total = Number(rows[0]?.total ?? 0);
    const avg = Number(rows[0]?.avg ?? 0);
    const progress = total <= 0 ? 0 : Math.round(avg);

    await this.projectsRepo.update(
      { id: input.projectId, organizationId: input.contextOrganizationId },
      { progress } as QueryDeepPartialEntity<Project>,
    );

    return progress;
  }

  async createProject(input: {
    contextOrganizationId: string;
    userId: string;
    permissionCodes: string[];
    dto: {
      departmentId: string;
      name: string;
      code: string;
      description?: string | null;
      managerId?: string | null;
      memberIds?: string[];
    };
  }) {
    if (!input.dto.departmentId || !String(input.dto.departmentId).trim()) {
      throw new BadRequestException('departmentId is required');
    }
    if (!input.dto.name || !input.dto.name.trim()) {
      throw new BadRequestException('name is required');
    }
    if (!input.dto.code || !input.dto.code.trim()) {
      throw new BadRequestException('code is required');
    }

    const departmentId = String(input.dto.departmentId);

    let hasRhDepartment = false;
    try {
      const rows = (await this.projectsRepo.manager.query(
        `
        SELECT d.id AS id
        FROM module_c_rh.departments d
        WHERE d.id = $1 AND d.organization_id = $2
        LIMIT 1
        `,
        [departmentId, input.contextOrganizationId],
      )) as Array<{ id?: string }>;

      hasRhDepartment = !!rows[0]?.id;
    } catch {
      hasRhDepartment = false;
    }

    if (!hasRhDepartment) {
      const coreRows = (await this.projectsRepo.manager.query(
        `
        SELECT d.id AS id, d.name AS name, d.code AS code
        FROM core.departments d
        WHERE d.id = $1 AND d.organization_id = $2
        LIMIT 1
        `,
        [departmentId, input.contextOrganizationId],
      )) as Array<{ id?: string; name?: string; code?: string }>;

      const coreDept = coreRows[0];
      if (!coreDept?.id) {
        throw new BadRequestException('Invalid departmentId');
      }

      // Try to sync core department into RH departments, so FK projects.department_id -> module_c_rh.departments stays valid
      try {
        await this.projectsRepo.manager.query(
          `
          INSERT INTO module_c_rh.departments (
            id,
            organization_id,
            parent_department_id,
            name,
            code,
            description,
            manager_id,
            location,
            cost_center,
            is_active
          )
          VALUES ($1,$2,NULL,$3,$4,NULL,NULL,NULL,NULL,true)
          ON CONFLICT (id) DO NOTHING
          `,
          [departmentId, input.contextOrganizationId, String(coreDept.name ?? ''), String(coreDept.code ?? '')],
        );

        // Verify it exists now
        const verify = (await this.projectsRepo.manager.query(
          `
          SELECT d.id AS id
          FROM module_c_rh.departments d
          WHERE d.id = $1 AND d.organization_id = $2
          LIMIT 1
          `,
          [departmentId, input.contextOrganizationId],
        )) as Array<{ id?: string }>;

        if (!verify[0]?.id) {
          throw new BadRequestException('Invalid departmentId');
        }
      } catch (err: any) {
        const msg = String(err?.message ?? err);

        if (msg.toLowerCase().includes('does not exist') && msg.toLowerCase().includes('module_c_rh')) {
          throw new BadRequestException(
            'Module RH manquant: impossible de créer un projet sans module_c_rh.departments. Exécute database/modules/module_c_rh.sql puis réessaie.',
          );
        }

        // Likely unique constraint on (organization_id, code)
        throw new BadRequestException(
          "Impossible de synchroniser le département dans RH (conflit code ou contrainte). Vérifie que core.departments et module_c_rh.departments sont alignés.",
        );
      }
    }

    const managerId = input.dto.managerId ?? null;

    const project = this.projectsRepo.create({
      organizationId: input.contextOrganizationId,
      departmentId,
      name: input.dto.name.trim(),
      code: input.dto.code.trim(),
      description: input.dto.description ?? null,
      managerId,
      createdBy: input.userId,
    });

    const saved = await this.projectsRepo.save(project);

    const rawMemberIds = Array.isArray(input.dto.memberIds) ? input.dto.memberIds : [];
    const memberIds = rawMemberIds.map((x) => String(x)).filter(Boolean);

    const uniqueUserIds = new Set<string>(memberIds);
    if (managerId) uniqueUserIds.add(managerId);

    for (const userId of uniqueUserIds) {
      await this.projectMembersRepo.save(
        this.projectMembersRepo.create({
          projectId: saved.id,
          userId,
          roleInProject: managerId && userId === managerId ? 'MANAGER' : 'MEMBER',
          addedBy: input.userId,
        }),
      );
    }

    return {
      id: saved.id,
      organizationId: saved.organizationId,
      departmentId: saved.departmentId,
      name: saved.name,
      code: saved.code,
      description: saved.description,
      managerId: saved.managerId,
      createdBy: saved.createdBy,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  private async resolveAccessibleOrganizationIdsForUser(userId: string): Promise<string[]> {
    const userRoles = await this.userRolesRepo.find({
      where: { userId, isActive: true },
      relations: ['role', 'role.organization'],
      order: { assignedAt: 'DESC' },
    });

    const hasSystemRole = userRoles.some(
      (ur) => ur.role?.isSystemRole || ur.role?.code === 'SUPER_ADMIN',
    );

    if (hasSystemRole) {
      const orgs = await this.organizationsRepo.find({
        order: { createdAt: 'DESC' },
        take: 500,
      });
      return orgs.map((o) => o.id);
    }

    const organizationsMap = new Map<string, Organization>();
    for (const ur of userRoles) {
      const org = ur.role?.organization;
      if (org && !organizationsMap.has(org.id)) {
        organizationsMap.set(org.id, org);
      }
    }

    const parentIds = Array.from(organizationsMap.keys());
    if (parentIds.length > 0) {
      const children = await this.organizationsRepo.find({
        where: { parentOrgId: In(parentIds) },
        order: { createdAt: 'DESC' },
        take: 500,
      });
      for (const child of children) {
        if (!organizationsMap.has(child.id)) {
          organizationsMap.set(child.id, child);
        }
      }
    }

    return Array.from(organizationsMap.keys());
  }

  private csvEscape(v: any): string {
    const s = String(v ?? '');
    if (/[\n\r",;]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  private async assertUserCanManageSubtasksOrThrow(input: {
    taskId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
  }): Promise<Task> {
    const task = await this.assertTaskReadableOrThrow({
      taskId: input.taskId,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    const isAssignee = !!task.assigneeId && task.assigneeId === input.userId;
    const permSet = new Set((input.permissionCodes ?? []).filter(Boolean));
    const hasElevatedWrite =
      permSet.has('projects.task.write.global') ||
      permSet.has('projects.task.write.tenant') ||
      permSet.has('projects.task.write.department') ||
      permSet.has('projects.task.write.team') ||
      permSet.has('projects.task.write.project');

    if (!isAssignee && !hasElevatedWrite) {
      try {
        await this.assertUserIsProjectManagerOrThrow({
          userId: input.userId,
          contextOrganizationId: input.contextOrganizationId,
          projectId: task.projectId,
        });
      } catch {
        const directManager = (await this.tasksRepo.manager.query(
          `
          SELECT 1 AS ok
          FROM module_b_projects.projects p
          WHERE p.id = $1
            AND p.organization_id = $2
            AND p.manager_id = $3
          LIMIT 1
          `,
          [task.projectId, input.contextOrganizationId, input.userId],
        )) as Array<{ ok?: number }>;

        if (!directManager[0]?.ok) {
          throw new ForbiddenException('Juste la personne a qui la tache appartient');
        }
      }
    }

    if (!hasElevatedWrite) {
      await this.assertUserIsProjectMemberOrThrow({
        userId: input.userId,
        contextOrganizationId: input.contextOrganizationId,
        projectId: task.projectId,
      });
    }

    return task;
  }

  private async recalcTaskProgressFromSubtasks(input: {
    taskId: string;
    contextOrganizationId: string;
  }): Promise<number> {
    const rows = (await this.tasksRepo.manager.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE s.is_completed = true)::int AS done
      FROM module_b_projects.subtasks s
      INNER JOIN module_b_projects.tasks t ON t.id = s.task_id
      WHERE s.task_id = $1 AND t.organization_id = $2
      `,
      [input.taskId, input.contextOrganizationId],
    )) as Array<{ total?: number; done?: number }>;

    const total = Number(rows[0]?.total ?? 0);
    const done = Number(rows[0]?.done ?? 0);
    const progress = total <= 0 ? 0 : Math.round((done / total) * 100);

    await this.tasksRepo.update(
      { id: input.taskId, organizationId: input.contextOrganizationId },
      { progress } as QueryDeepPartialEntity<Task>,
    );

    return progress;
  }

  async listSubtasks(input: {
    taskId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
  }) {
    await this.assertTaskReadableOrThrow({
      taskId: input.taskId,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    const rows = await this.subtasksRepo.find({
      where: { taskId: input.taskId },
      order: { position: 'ASC', createdAt: 'ASC' },
      take: 500,
    });

    return rows.map((s) => ({
      id: s.id,
      taskId: s.taskId,
      title: s.title,
      description: s.description,
      isCompleted: s.isCompleted,
      completedBy: s.completedBy,
      completedAt: s.completedAt,
      dueDate: s.dueDate,
      position: s.position,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async createSubtask(input: {
    taskId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
    dto: {
      title: string;
      description?: string | null;
      dueDate?: string | null;
      position?: number;
    };
  }) {
    if (!input.dto.title || !input.dto.title.trim()) {
      throw new BadRequestException('title is required');
    }

    const task = await this.assertUserCanManageSubtasksOrThrow({
      taskId: input.taskId,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    const created = await this.subtasksRepo.save(
      this.subtasksRepo.create({
        taskId: input.taskId,
        title: input.dto.title.trim(),
        description: input.dto.description ?? null,
        dueDate: input.dto.dueDate ?? null,
        position: typeof input.dto.position === 'number' ? input.dto.position : 0,
      }),
    );

    const progress = await this.recalcTaskProgressFromSubtasks({
      taskId: input.taskId,
      contextOrganizationId: input.contextOrganizationId,
    });

    await this.recalcProjectProgressFromTasks({
      projectId: task.projectId,
      contextOrganizationId: input.contextOrganizationId,
    });

    return {
      id: created.id,
      taskId: created.taskId,
      title: created.title,
      description: created.description,
      isCompleted: created.isCompleted,
      completedBy: created.completedBy,
      completedAt: created.completedAt,
      dueDate: created.dueDate,
      position: created.position,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      taskProgress: progress,
    };
  }

  async updateSubtask(input: {
    subtaskId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
    dto: {
      title?: string;
      description?: string | null;
      dueDate?: string | null;
      position?: number;
      isCompleted?: boolean;
    };
  }) {
    const subtask = await this.subtasksRepo
      .createQueryBuilder('s')
      .innerJoin(Task, 't', 't.id = s.task_id')
      .where('s.id = :id', { id: input.subtaskId })
      .andWhere('t.organization_id = :orgId', { orgId: input.contextOrganizationId })
      .getOne();
    if (!subtask) {
      throw new NotFoundException('Subtask not found');
    }

    const task = await this.assertUserCanManageSubtasksOrThrow({
      taskId: subtask.taskId,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    const patch: QueryDeepPartialEntity<Subtask> = {};
    if (typeof input.dto.title === 'string') patch.title = input.dto.title;
    if (input.dto.description !== undefined) patch.description = input.dto.description ?? null;
    if (input.dto.dueDate !== undefined) patch.dueDate = input.dto.dueDate ?? null;
    if (typeof input.dto.position === 'number') patch.position = input.dto.position;

    if (typeof input.dto.isCompleted === 'boolean') {
      patch.isCompleted = input.dto.isCompleted;
      if (input.dto.isCompleted) {
        patch.completedBy = input.userId;
        patch.completedAt = new Date();
      } else {
        patch.completedBy = null;
        patch.completedAt = null;
      }
    }

    await this.subtasksRepo.update({ id: input.subtaskId }, patch);

    const progress = await this.recalcTaskProgressFromSubtasks({
      taskId: subtask.taskId,
      contextOrganizationId: input.contextOrganizationId,
    });

    await this.recalcProjectProgressFromTasks({
      projectId: task.projectId,
      contextOrganizationId: input.contextOrganizationId,
    });

    const updated = await this.subtasksRepo.findOne({ where: { id: input.subtaskId } });
    if (!updated) {
      throw new NotFoundException('Subtask not found');
    }

    return {
      id: updated.id,
      taskId: updated.taskId,
      title: updated.title,
      description: updated.description,
      isCompleted: updated.isCompleted,
      completedBy: updated.completedBy,
      completedAt: updated.completedAt,
      dueDate: updated.dueDate,
      position: updated.position,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      taskProgress: progress,
    };
  }

  async deleteSubtask(input: {
    subtaskId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
  }) {
    const subtask = await this.subtasksRepo
      .createQueryBuilder('s')
      .innerJoin(Task, 't', 't.id = s.task_id')
      .where('s.id = :id', { id: input.subtaskId })
      .andWhere('t.organization_id = :orgId', { orgId: input.contextOrganizationId })
      .getOne();
    if (!subtask) {
      throw new NotFoundException('Subtask not found');
    }

    const task = await this.assertUserCanManageSubtasksOrThrow({
      taskId: subtask.taskId,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    await this.subtasksRepo.delete({ id: input.subtaskId });

    const progress = await this.recalcTaskProgressFromSubtasks({
      taskId: subtask.taskId,
      contextOrganizationId: input.contextOrganizationId,
    });

    await this.recalcProjectProgressFromTasks({
      projectId: task.projectId,
      contextOrganizationId: input.contextOrganizationId,
    });

    return { deleted: true, taskId: subtask.taskId, taskProgress: progress };
  }

  async listTaskComments(input: {
    taskId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
  }) {
    await this.assertTaskReadableOrThrow({
      taskId: input.taskId,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    const rows = await this.taskCommentsRepo
      .createQueryBuilder('c')
      .leftJoin(Task, 't', 't.id = c.task_id')
      .leftJoin('c.user', 'u')
      .where('c.task_id = :taskId', { taskId: input.taskId })
      .andWhere('t.organization_id = :orgId', { orgId: input.contextOrganizationId })
      .orderBy('c.createdAt', 'ASC')
      .getMany();

    return rows.map((c) => {
      const rawName = c.user ? `${c.user.firstName ?? ''} ${c.user.lastName ?? ''}`.trim() : '';
      const authorName = rawName ? rawName : null;
      return {
        id: c.id,
        taskId: c.taskId,
        parentCommentId: c.parentCommentId,
        userId: c.userId,
        authorName,
        authorEmail: c.user?.email ?? null,
        content: c.content,
        contentType: c.contentType,
        isInternal: c.isInternal,
        visibility: c.visibility,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
  }

  async createTaskComment(input: {
    taskId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
    dto: {
      content: string;
      parentCommentId?: string | null;
      visibility?: string | null;
      isInternal?: boolean | null;
    };
  }) {
    await this.assertTaskReadableOrThrow({
      taskId: input.taskId,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    const content = String(input.dto.content ?? '').trim();
    if (!content) {
      throw new BadRequestException('content is required');
    }

    const comment = this.taskCommentsRepo.create({
      taskId: input.taskId,
      userId: input.userId,
      parentCommentId: input.dto.parentCommentId ?? null,
      content,
      contentType: 'text',
      visibility: input.dto.visibility ? String(input.dto.visibility) : 'public',
      isInternal: input.dto.isInternal ?? true,
      mentions: [],
    });

    const saved = await this.taskCommentsRepo.save(comment);

    const withUser = await this.taskCommentsRepo
      .createQueryBuilder('c')
      .leftJoin('c.user', 'u')
      .where('c.id = :id', { id: saved.id })
      .getOne();

    const rawName = withUser?.user
      ? `${withUser.user.firstName ?? ''} ${withUser.user.lastName ?? ''}`.trim()
      : '';
    const authorName = rawName ? rawName : null;

    const payload = {
      id: saved.id,
      taskId: saved.taskId,
      parentCommentId: saved.parentCommentId,
      userId: saved.userId,
      authorName,
      authorEmail: withUser?.user?.email ?? null,
      content: saved.content,
      contentType: saved.contentType,
      isInternal: saved.isInternal,
      visibility: saved.visibility,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };

    this.taskCommentsRealtime.emitCommentCreated({
      organizationId: input.contextOrganizationId,
      taskId: saved.taskId,
      payload,
    });

    return payload;
  }

  private async assertTaskReadableOrThrow(input: {
    taskId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
  }): Promise<Task> {
    const readScope = this.resolveTaskReadScope(input.permissionCodes);

    const qb = this.tasksRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.project', 'p')
      .leftJoinAndSelect('t.assignee', 'a')
      .where('t.id = :id', { id: input.taskId })
      .andWhere('t.organization_id = :orgId', { orgId: input.contextOrganizationId });

    if (readScope === 'own') {
      qb.andWhere('(t.assignee_id = :userId OR t.created_by = :userId)', {
        userId: input.userId,
      });
    } else if (readScope === 'department' || readScope === 'team') {
      const rh = await this.resolveRhContextForUser({
        userId: input.userId,
        organizationId: input.contextOrganizationId,
      });

      if (!rh) {
        qb.andWhere('(t.assignee_id = :userId OR t.created_by = :userId)', {
          userId: input.userId,
        });
      } else if (readScope === 'department') {
        if (!rh.departmentId) {
          qb.andWhere('(t.assignee_id = :userId OR t.created_by = :userId)', {
            userId: input.userId,
          });
        } else {
          qb.andWhere(
            `(
              t.assignee_id IN (
                SELECT e.user_id
                FROM module_c_rh.employees e
                WHERE e.organization_id = :ctxOrgId
                  AND e.department_id = :deptId
              )
              OR t.created_by IN (
                SELECT e.user_id
                FROM module_c_rh.employees e
                WHERE e.organization_id = :ctxOrgId
                  AND e.department_id = :deptId
              )
            )`,
            {
              ctxOrgId: input.contextOrganizationId,
              deptId: rh.departmentId,
            },
          );
        }
      } else {
        qb.andWhere(
          `(
            t.assignee_id IN (
              WITH RECURSIVE team AS (
                SELECT e.id, e.user_id
                FROM module_c_rh.employees e
                WHERE e.id = :employeeId AND e.organization_id = :ctxOrgId
                UNION ALL
                SELECT e2.id, e2.user_id
                FROM module_c_rh.employees e2
                INNER JOIN team t0 ON e2.manager_id = t0.id
                WHERE e2.organization_id = :ctxOrgId
              )
              SELECT user_id FROM team WHERE user_id IS NOT NULL
            )
            OR t.created_by IN (
              WITH RECURSIVE team AS (
                SELECT e.id, e.user_id
                FROM module_c_rh.employees e
                WHERE e.id = :employeeId AND e.organization_id = :ctxOrgId
                UNION ALL
                SELECT e2.id, e2.user_id
                FROM module_c_rh.employees e2
                INNER JOIN team t0 ON e2.manager_id = t0.id
                WHERE e2.organization_id = :ctxOrgId
              )
              SELECT user_id FROM team WHERE user_id IS NOT NULL
            )
          )`,
          {
            ctxOrgId: input.contextOrganizationId,
            employeeId: rh.employeeId,
          },
        );
      }
    }

    const task = await qb.getOne();
    if (!task) {
      const exists = await this.tasksRepo.findOne({
        where: { id: input.taskId, organizationId: input.contextOrganizationId },
      });
      if (!exists) {
        throw new NotFoundException('Task not found');
      }
      throw new ForbiddenException('Task not accessible');
    }

    return task;
  }

  async getTaskById(input: {
    id: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
  }) {
    const t = await this.assertTaskReadableOrThrow({
      taskId: input.id,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    const assigneeName = t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}`.trim() : null;

    return {
      id: t.id,
      organizationId: t.organizationId,
      project: t.project ? { id: t.project.id, name: t.project.name, code: t.project.code } : null,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      startDate: t.startDate,
      dueDate: t.dueDate,
      progress: t.progress,
      assigneeId: t.assigneeId,
      assigneeName,
      reporterId: t.reporterId,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      completedAt: t.completedAt,
    };
  }

  async createTask(input: {
    contextOrganizationId: string;
    userId: string;
    permissionCodes: string[];
    dto: {
      projectId: string;
      title: string;
      description?: string | null;
      assigneeId?: string | null;
      reporterId?: string | null;
      startDate?: string | null;
      dueDate?: string | null;
      priority?: string;
      status?: string;
      progress?: number;
    };
  }) {
    if (!input.dto.title || !input.dto.title.trim()) {
      throw new BadRequestException('title is required');
    }

    const project = await this.projectsRepo.findOne({
      where: { id: input.dto.projectId, organizationId: input.contextOrganizationId },
    });
    if (!project) {
      throw new BadRequestException('Invalid projectId');
    }

    const canCreateInProject = (input.permissionCodes ?? []).includes('projects.task.create.project');
    if (canCreateInProject) {
      await this.assertUserIsProjectManagerOrThrow({
        userId: input.userId,
        contextOrganizationId: input.contextOrganizationId,
        projectId: project.id,
      });
    }

    if (input.dto.assigneeId) {
      const membership = await this.projectMembersRepo.findOne({
        where: { projectId: project.id, userId: input.dto.assigneeId },
      });
      if (!membership) {
        throw new BadRequestException('assigneeId must be a project member');
      }
    }

    const task = this.tasksRepo.create({
      organizationId: input.contextOrganizationId,
      departmentId: project.departmentId,
      projectId: input.dto.projectId,
      title: input.dto.title.trim(),
      description: input.dto.description ?? null,
      assigneeId: input.dto.assigneeId ?? null,
      reporterId: input.dto.reporterId ?? null,
      startDate: input.dto.startDate ?? null,
      dueDate: input.dto.dueDate ?? null,
      priority: input.dto.priority ?? 'medium',
      status: input.dto.status ?? 'todo',
      progress: typeof input.dto.progress === 'number' ? input.dto.progress : 0,
      createdBy: input.userId,
    });

    const saved = await this.tasksRepo.save(task);

    await this.recalcProjectProgressFromTasks({
      projectId: saved.projectId,
      contextOrganizationId: input.contextOrganizationId,
    });

    return this.getTaskById({
      id: saved.id,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: ['projects.task.read.tenant'],
    });
  }

  async updateTask(input: {
    id: string;
    contextOrganizationId: string;
    userId: string;
    permissionCodes: string[];
    dto: {
      title?: string;
      description?: string | null;
      assigneeId?: string | null;
      reporterId?: string | null;
      startDate?: string | null;
      dueDate?: string | null;
      priority?: string;
      status?: string;
      progress?: number;
    };
  }) {
    const writeScope = this.resolveTaskWriteScope(input.permissionCodes);

    const task = await this.tasksRepo.findOne({
      where: { id: input.id, organizationId: input.contextOrganizationId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (input.dto.assigneeId !== undefined && input.dto.assigneeId) {
      const membership = await this.projectMembersRepo.findOne({
        where: { projectId: task.projectId, userId: input.dto.assigneeId },
      });
      if (!membership) {
        throw new BadRequestException('assigneeId must be a project member');
      }
    }

    if (writeScope === 'own') {
      const owns = task.assigneeId === input.userId || task.createdBy === input.userId;
      if (!owns) {
        throw new ForbiddenException('Task not writable');
      }
    } else if (writeScope === 'project') {
      await this.assertUserIsProjectManagerOrThrow({
        userId: input.userId,
        contextOrganizationId: input.contextOrganizationId,
        projectId: task.projectId,
      });
    }

    // For team/department/tenant/global: we rely on read-scope filtering logic for accessibility
    if (writeScope === 'team' || writeScope === 'department') {
      await this.assertTaskReadableOrThrow({
        taskId: input.id,
        userId: input.userId,
        contextOrganizationId: input.contextOrganizationId,
        permissionCodes: [`projects.task.read.${writeScope}`],
      });
    }

    const patch: QueryDeepPartialEntity<Task> = {};
    if (typeof input.dto.title === 'string') patch.title = input.dto.title;
    if (input.dto.description !== undefined) patch.description = input.dto.description ?? null;
    if (input.dto.assigneeId !== undefined) patch.assigneeId = input.dto.assigneeId ?? null;
    if (input.dto.reporterId !== undefined) patch.reporterId = input.dto.reporterId ?? null;
    if (input.dto.startDate !== undefined) patch.startDate = input.dto.startDate ?? null;
    if (input.dto.dueDate !== undefined) patch.dueDate = input.dto.dueDate ?? null;
    if (typeof input.dto.priority === 'string') patch.priority = input.dto.priority;
    if (typeof input.dto.status === 'string') patch.status = input.dto.status;
    if (typeof input.dto.progress === 'number') patch.progress = input.dto.progress;

    await this.tasksRepo.update(
      { id: input.id, organizationId: input.contextOrganizationId },
      patch,
    );

    await this.recalcProjectProgressFromTasks({
      projectId: task.projectId,
      contextOrganizationId: input.contextOrganizationId,
    });

    return this.getTaskById({
      id: input.id,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });
  }

  async deleteTask(input: {
    id: string;
    contextOrganizationId: string;
    userId: string;
    permissionCodes: string[];
  }) {
    const deleteScope = this.resolveTaskDeleteScope(input.permissionCodes);

    const task = await this.tasksRepo.findOne({
      where: { id: input.id, organizationId: input.contextOrganizationId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (deleteScope === 'own') {
      const owns = task.assigneeId === input.userId || task.createdBy === input.userId;
      if (!owns) {
        throw new ForbiddenException('Task not deletable');
      }
    } else if (deleteScope === 'project') {
      await this.assertUserIsProjectManagerOrThrow({
        userId: input.userId,
        contextOrganizationId: input.contextOrganizationId,
        projectId: task.projectId,
      });
    }

    await this.tasksRepo.delete({ id: input.id, organizationId: input.contextOrganizationId });

    await this.recalcProjectProgressFromTasks({
      projectId: task.projectId,
      contextOrganizationId: input.contextOrganizationId,
    });
  }

  async validateTask(input: {
    id: string;
    contextOrganizationId: string;
    userId: string;
    permissionCodes: string[];
  }) {
    const scope = this.resolveTaskValidateScope(input.permissionCodes);

    if (scope === 'project') {
      const task = await this.tasksRepo.findOne({
        where: { id: input.id, organizationId: input.contextOrganizationId },
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }

      await this.assertUserIsProjectManagerOrThrow({
        userId: input.userId,
        contextOrganizationId: input.contextOrganizationId,
        projectId: task.projectId,
      });
    } else if (scope === 'team' || scope === 'department') {
      await this.assertTaskReadableOrThrow({
        taskId: input.id,
        userId: input.userId,
        contextOrganizationId: input.contextOrganizationId,
        permissionCodes: [`projects.task.read.${scope}`],
      });
    } else {
      const task = await this.tasksRepo.findOne({
        where: { id: input.id, organizationId: input.contextOrganizationId },
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }
    }

    await this.tasksRepo.update(
      { id: input.id, organizationId: input.contextOrganizationId },
      { status: 'approved', completedAt: new Date() } as QueryDeepPartialEntity<Task>,
    );

    const updatedTask = await this.tasksRepo.findOne({
      where: { id: input.id, organizationId: input.contextOrganizationId },
    });
    if (updatedTask?.projectId) {
      await this.recalcProjectProgressFromTasks({
        projectId: updatedTask.projectId,
        contextOrganizationId: input.contextOrganizationId,
      });
    }

    return this.getTaskById({
      id: input.id,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });
  }

  async exportControlTowerCsv(input: {
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
    organizationIds?: string[];
    bucket?: ControlTowerBucket;
  }): Promise<{ contentType: string; fileName: string; data: string }> {
    const rows = await this.listControlTowerTasks({
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
      organizationIds: input.organizationIds,
      bucket: input.bucket,
      take: 1000,
    });

    const header = [
      'task_id',
      'organization_id',
      'organization_code',
      'project_code',
      'project_name',
      'title',
      'status',
      'priority',
      'due_date',
      'progress',
      'assignee_name',
      'updated_at',
    ];

    const lines = [header.join(';')];
    for (const r of rows as any[]) {
      lines.push(
        [
          this.csvEscape(r.id),
          this.csvEscape(r.organizationId),
          this.csvEscape(r.organizationCode ?? ''),
          this.csvEscape(r.project?.code ?? ''),
          this.csvEscape(r.project?.name ?? ''),
          this.csvEscape(r.title),
          this.csvEscape(r.status),
          this.csvEscape(r.priority),
          this.csvEscape(r.dueDate ?? ''),
          this.csvEscape(r.progress ?? 0),
          this.csvEscape(r.assigneeName ?? ''),
          this.csvEscape(r.updatedAt ?? ''),
        ].join(';'),
      );
    }

    const fileName = `control_tower_${new Date().toISOString().slice(0, 10)}.csv`;
    return {
      contentType: 'text/csv; charset=utf-8',
      fileName,
      data: lines.join('\n'),
    };
  }

  private resolveTaskReadScope(permissionCodes: string[]): TaskReadScope {
    const set = new Set((permissionCodes ?? []).filter(Boolean));

    if (set.has('projects.task.read.global')) return 'global';
    if (set.has('projects.task.read.tenant')) return 'tenant';
    if (set.has('projects.task.read.department')) return 'department';
    if (set.has('projects.task.read.team')) return 'team';
    if (set.has('projects.task.read.project')) return 'project';
    if (set.has('projects.task.read.own')) return 'own';

    return 'own';
  }

  private resolveTaskWriteScope(permissionCodes: string[]): TaskWriteScope {
    const set = new Set((permissionCodes ?? []).filter(Boolean));

    if (set.has('projects.task.write.global')) return 'global';
    if (set.has('projects.task.write.tenant')) return 'tenant';
    if (set.has('projects.task.write.department')) return 'department';
    if (set.has('projects.task.write.team')) return 'team';
    if (set.has('projects.task.write.project')) return 'project';
    if (set.has('projects.task.write.own')) return 'own';

    return 'own';
  }

  private resolveTaskDeleteScope(permissionCodes: string[]): TaskDeleteScope {
    const set = new Set((permissionCodes ?? []).filter(Boolean));
    if (set.has('projects.task.delete.global')) return 'global';
    if (set.has('projects.task.delete.tenant')) return 'tenant';
    if (set.has('projects.task.delete.project')) return 'project';
    if (set.has('projects.task.delete.own')) return 'own';
    return 'own';
  }

  private resolveTaskValidateScope(permissionCodes: string[]): TaskValidateScope {
    const set = new Set((permissionCodes ?? []).filter(Boolean));
    if (set.has('projects.task.validate.global')) return 'global';
    if (set.has('projects.task.validate.tenant')) return 'tenant';
    if (set.has('projects.task.validate.department')) return 'department';
    if (set.has('projects.task.validate.team')) return 'team';
    if (set.has('projects.task.validate.project')) return 'project';
    return 'team';
  }

  private async assertUserIsProjectMemberOrThrow(input: {
    userId: string;
    contextOrganizationId: string;
    projectId: string;
  }): Promise<void> {
    const rows = (await this.tasksRepo.manager.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.project_members pm
      INNER JOIN module_b_projects.projects p ON p.id = pm.project_id
      WHERE pm.user_id = $1
        AND pm.project_id = $2
        AND p.organization_id = $3
      LIMIT 1
      `,
      [input.userId, input.projectId, input.contextOrganizationId],
    )) as Array<{ ok?: number }>;

    if (!rows[0]?.ok) {
      throw new ForbiddenException('User is not a member of this project');
    }
  }

  private async assertUserIsProjectManagerOrThrow(input: {
    userId: string;
    contextOrganizationId: string;
    projectId: string;
  }): Promise<void> {
    const rows = (await this.tasksRepo.manager.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.project_members pm
      INNER JOIN module_b_projects.projects p ON p.id = pm.project_id
      WHERE pm.user_id = $1
        AND pm.project_id = $2
        AND p.organization_id = $3
        AND pm.role_in_project = 'MANAGER'
      LIMIT 1
      `,
      [input.userId, input.projectId, input.contextOrganizationId],
    )) as Array<{ ok?: number }>;

    if (!rows[0]?.ok) {
      throw new ForbiddenException('User is not a manager of this project');
    }
  }

  private async resolveRhContextForUser(input: {
    userId: string;
    organizationId: string;
  }): Promise<{ employeeId: string; departmentId: string | null } | null> {
    try {
      const rows = (await this.tasksRepo.manager.query(
        `
        SELECT e.id AS employee_id, e.department_id AS department_id
        FROM module_c_rh.employees e
        WHERE e.user_id = $1 AND e.organization_id = $2
        LIMIT 1
        `,
        [input.userId, input.organizationId],
      )) as Array<{ employee_id?: string; department_id?: string | null }>;

      const first = rows[0];
      if (!first?.employee_id) {
        return null;
      }

      return {
        employeeId: String(first.employee_id),
        departmentId: first.department_id ? String(first.department_id) : null,
      };
    } catch {
      // RH module not installed or schema/table missing
      return null;
    }
  }

  private getBucketWhereClause(bucket: ControlTowerBucket) {
    if (bucket === 'overdue') {
      return {
        sql: "t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE AND t.status NOT IN ('completed','cancelled','approved')",
        params: {},
      };
    }

    if (bucket === 'pending_validation') {
      return {
        sql: "t.status IN ('review','revision')",
        params: {},
      };
    }

    if (bucket === 'completed') {
      return {
        sql: "(t.completed_at IS NOT NULL OR t.status IN ('completed','approved'))",
        params: {},
      };
    }

    return {
      sql: "t.status IN ('in_progress','blocked','todo')",
      params: {},
    };
  }

  async listControlTowerTasks(input: {
    userId: string;
    contextOrganizationId: string;
    organizationIds?: string[];
    bucket?: ControlTowerBucket;
    take?: number;
    permissionCodes?: string[];
  }) {
    const allowedOrgIds = await this.resolveAccessibleOrganizationIdsForUser(input.userId);
    const desiredOrgIds = (input.organizationIds ?? []).filter(Boolean);

    const readScope = this.resolveTaskReadScope(input.permissionCodes ?? []);

    const candidateOrgIds =
      readScope === 'global' || readScope === 'tenant'
        ? desiredOrgIds.length
          ? desiredOrgIds
          : allowedOrgIds
        : [input.contextOrganizationId];

    const orgIds = candidateOrgIds.filter((id) => allowedOrgIds.includes(id));

    if (orgIds.length === 0) {
      return [];
    }

    const qb = this.tasksRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.project', 'p')
      .leftJoinAndSelect('t.assignee', 'a')
      .where('t.organization_id IN (:...orgIds)', { orgIds });

    if (readScope === 'own') {
      qb.andWhere('(t.assignee_id = :userId OR t.created_by = :userId)', {
        userId: input.userId,
      });
    } else if (readScope === 'project') {
      qb.andWhere(
        `t.project_id IN (
          SELECT pm.project_id
          FROM module_b_projects.project_members pm
          WHERE pm.user_id = :userId
        )`,
        { userId: input.userId },
      );
    } else if (readScope === 'department' || readScope === 'team') {
      const rh = await this.resolveRhContextForUser({
        userId: input.userId,
        organizationId: input.contextOrganizationId,
      });

      if (!rh) {
        qb.andWhere('(t.assignee_id = :userId OR t.created_by = :userId)', {
          userId: input.userId,
        });
      } else if (readScope === 'department') {
        if (!rh.departmentId) {
          qb.andWhere('(t.assignee_id = :userId OR t.created_by = :userId)', {
            userId: input.userId,
          });
        } else {
          qb.andWhere(
            `(
              t.assignee_id IN (
                SELECT e.user_id
                FROM module_c_rh.employees e
                WHERE e.organization_id = :ctxOrgId
                  AND e.department_id = :deptId
              )
              OR t.created_by IN (
                SELECT e.user_id
                FROM module_c_rh.employees e
                WHERE e.organization_id = :ctxOrgId
                  AND e.department_id = :deptId
              )
            )`,
            {
              ctxOrgId: input.contextOrganizationId,
              deptId: rh.departmentId,
            },
          );
        }
      } else {
        // team: recursive hierarchy from current employee.id
        qb.andWhere(
          `(
            t.assignee_id IN (
              WITH RECURSIVE team AS (
                SELECT e.id, e.user_id
                FROM module_c_rh.employees e
                WHERE e.id = :employeeId AND e.organization_id = :ctxOrgId
                UNION ALL
                SELECT e2.id, e2.user_id
                FROM module_c_rh.employees e2
                INNER JOIN team t0 ON e2.manager_id = t0.id
                WHERE e2.organization_id = :ctxOrgId
              )
              SELECT user_id FROM team WHERE user_id IS NOT NULL
            )
            OR t.created_by IN (
              WITH RECURSIVE team AS (
                SELECT e.id, e.user_id
                FROM module_c_rh.employees e
                WHERE e.id = :employeeId AND e.organization_id = :ctxOrgId
                UNION ALL
                SELECT e2.id, e2.user_id
                FROM module_c_rh.employees e2
                INNER JOIN team t0 ON e2.manager_id = t0.id
                WHERE e2.organization_id = :ctxOrgId
              )
              SELECT user_id FROM team WHERE user_id IS NOT NULL
            )
          )`,
          {
            ctxOrgId: input.contextOrganizationId,
            employeeId: rh.employeeId,
          },
        );
      }
    }

    if (input.bucket) {
      const where = this.getBucketWhereClause(input.bucket);
      qb.andWhere(where.sql, where.params);
    }

    if (input.bucket === 'completed') {
      qb.orderBy('t.completedAt', 'DESC').addOrderBy('t.updatedAt', 'DESC');
    } else {
      qb.orderBy('t.dueDate', 'ASC').addOrderBy('t.updatedAt', 'DESC');
    }

    qb.take(Math.min(200, Math.max(1, input.take ?? 50)));

    let rows: Task[];
    let organizations: Organization[];
    try {
      rows = await qb.getMany();
      organizations = await this.organizationsRepo.find({
        where: { id: In(orgIds) },
        take: 500,
      });
    } catch (err: any) {
      const message = String(err?.message ?? err);

      if (message.toLowerCase().includes('relation') && message.toLowerCase().includes('does not exist')) {
        throw new BadRequestException(
          "Tables Module B introuvables. Exécute le script SQL database/modules/module_b_projects.sql (schema module_b_projects, tables projects/tasks) puis relance le backend.",
        );
      }

      // eslint-disable-next-line no-console
      console.error('[projects] control-tower failed', err);
      throw new InternalServerErrorException('Erreur interne chargement tour de contrôle');
    }

    const orgNameById = new Map<string, { name: string; nameCode: string | null }>();
    for (const o of organizations) {
      orgNameById.set(o.id, { name: o.name, nameCode: o.nameCode ?? null });
    }

    return rows.map((t) => {
      const assigneeName = t.assignee
        ? `${t.assignee.firstName} ${t.assignee.lastName}`.trim()
        : null;
      const org = orgNameById.get(t.organizationId);
      return {
        id: t.id,
        organizationId: t.organizationId,
        organizationName: org?.name ?? null,
        organizationCode: org?.nameCode ?? null,
        project: t.project
          ? { id: t.project.id, name: t.project.name, code: t.project.code }
          : null,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        progress: t.progress,
        assigneeId: t.assigneeId,
        assigneeName,
        updatedAt: t.updatedAt,
      };
    });
  }
}
