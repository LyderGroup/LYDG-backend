import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Subtask } from './subtask.entity';
import { Task } from './task.entity';

export interface SubtaskListResult {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  isCompleted: boolean;
  completedBy: string | null;
  completedAt: Date | null;
  dueDate: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubtaskCreateResult {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  isCompleted: boolean;
  dueDate: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  taskProgress: number;
}

export interface SubtaskUpdateResult {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  isCompleted: boolean;
  completedBy: string | null;
  completedAt: Date | null;
  dueDate: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  taskProgress: number;
}

@Injectable()
export class SubtaskService {
  private readonly logger = new Logger(SubtaskService.name);

  constructor(
    @InjectRepository(Subtask)
    private readonly subtasksRepo: Repository<Subtask>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
  ) {}

  async listSubtasks(taskId: string): Promise<SubtaskListResult[]> {
    const rows = await this.subtasksRepo.find({
      where: { taskId },
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
    dto: {
      title: string;
      description?: string | null;
      dueDate?: string | null;
      position?: number;
    };
  }): Promise<SubtaskCreateResult> {
    if (!input.dto.title || !input.dto.title.trim()) {
      throw new BadRequestException('title is required');
    }

    const created = await this.subtasksRepo.save(
      this.subtasksRepo.create({
        taskId: input.taskId,
        title: input.dto.title.trim(),
        description: input.dto.description ?? null,
        dueDate: input.dto.dueDate ?? null,
        position: typeof input.dto.position === 'number' ? input.dto.position : 0,
      }),
    );

    const progress = await this.recalcTaskProgressFromSubtasks(input.taskId);

    return {
      id: created.id,
      taskId: created.taskId,
      title: created.title,
      description: created.description,
      isCompleted: created.isCompleted,
      dueDate: created.dueDate,
      position: created.position,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      taskProgress: progress,
    };
  }

  async updateSubtask(input: {
    subtaskId: string;
    contextOrganizationId: string;
    userId: string;
    dto: {
      title?: string;
      description?: string | null;
      dueDate?: string | null;
      isCompleted?: boolean;
      position?: number;
    };
  }): Promise<SubtaskUpdateResult> {
    // 1ère tentative : task dans l'org du user (cas le plus simple).
    let subtask = await this.subtasksRepo
      .createQueryBuilder('s')
      .innerJoin(Task, 't', 't.id = s.task_id')
      .where('s.id = :id', { id: input.subtaskId })
      .andWhere('s.deleted_at IS NULL')
      .andWhere('t.organization_id = :orgId', { orgId: input.contextOrganizationId })
      .getOne();

    // 2e tentative (multi-département/multi-org) : si pas trouvé, on cherche
    // la subtask sans filtre tenant ET on vérifie que le user est membre du
    // projet (ou manager/créateur). Ça gère les projets cross-organisation.
    if (!subtask) {
      const crossOrgAccess: Array<{ subtask_id: string }> = await this.subtasksRepo.manager.query(
        `
        SELECT s.id AS subtask_id
        FROM module_b_projects.subtasks s
        INNER JOIN module_b_projects.tasks t ON t.id = s.task_id
        INNER JOIN module_b_projects.projects p ON p.id = t.project_id
        LEFT JOIN module_b_projects.project_members pm
          ON pm.project_id = p.id AND pm.user_id = $2
        LEFT JOIN module_b_projects.project_managers pma
          ON pma.project_id = p.id AND pma.user_id = $2
        WHERE s.id = $1
          AND s.deleted_at IS NULL
          AND (
            pm.id IS NOT NULL
            OR pma.id IS NOT NULL
            OR p.manager_id = $2
            OR p.created_by = $2
            OR t.assignee_id = $2
            OR s.completed_by = $2
          )
        LIMIT 1
        `,
        [input.subtaskId, input.userId],
      );

      if (crossOrgAccess.length > 0) {
        // Le user a accès via membership → on récupère la subtask sans filtre tenant
        subtask = await this.subtasksRepo.findOne({
          where: { id: input.subtaskId },
        });
      }
    }

    if (!subtask) {
      throw new NotFoundException('Subtask not found');
    }

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

    const progress = await this.recalcTaskProgressFromSubtasks(subtask.taskId);

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
    contextOrganizationId: string;
    userId?: string;
    reason?: string;
  }): Promise<{ deleted: boolean; taskId: string; taskProgress: number }> {
    // Cas standard : task dans l'org du user.
    let subtask = await this.subtasksRepo
      .createQueryBuilder('s')
      .innerJoin(Task, 't', 't.id = s.task_id')
      .where('s.id = :id', { id: input.subtaskId })
      .andWhere('t.organization_id = :orgId', { orgId: input.contextOrganizationId })
      .andWhere('s.deleted_at IS NULL')
      .getOne();

    // Cas cross-org/département : vérifier membership avant d'autoriser.
    if (!subtask && input.userId) {
      const access: Array<{ ok: number }> = await this.subtasksRepo.manager.query(
        `
        SELECT 1 AS ok
        FROM module_b_projects.subtasks s
        INNER JOIN module_b_projects.tasks t ON t.id = s.task_id
        INNER JOIN module_b_projects.projects p ON p.id = t.project_id
        LEFT JOIN module_b_projects.project_members pm
          ON pm.project_id = p.id AND pm.user_id = $2
        LEFT JOIN module_b_projects.project_managers pma
          ON pma.project_id = p.id AND pma.user_id = $2
        WHERE s.id = $1
          AND s.deleted_at IS NULL
          AND (
            pm.id IS NOT NULL OR pma.id IS NOT NULL
            OR p.manager_id = $2 OR p.created_by = $2
            OR t.assignee_id = $2
          )
        LIMIT 1
        `,
        [input.subtaskId, input.userId],
      );
      if (access.length > 0) {
        subtask = await this.subtasksRepo.findOne({ where: { id: input.subtaskId } });
      }
    }

    if (!subtask) {
      throw new NotFoundException('Subtask not found');
    }

    // Soft-delete (Sprint B) — préserve l'historique pour conformité.
    await this.subtasksRepo.update(
      { id: input.subtaskId },
      {
        deletedAt: new Date(),
        deletedBy: input.userId ?? null,
        deletionReason: input.reason ?? null,
      } as any,
    );

    const progress = await this.recalcTaskProgressFromSubtasks(subtask.taskId);

    return { deleted: true, taskId: subtask.taskId, taskProgress: progress };
  }

  async recalcTaskProgressFromSubtasks(taskId: string): Promise<number> {
    const rows = (await this.subtasksRepo.manager.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE s.is_completed = true)::int AS done
      FROM module_b_projects.subtasks s
      INNER JOIN module_b_projects.tasks t ON t.id = s.task_id
      WHERE s.task_id = $1
        AND s.deleted_at IS NULL
        AND t.deleted_at IS NULL
      `,
      [taskId],
    )) as Array<{ total?: number; done?: number }>;

    const total = rows[0]?.total ?? 0;
    const done = rows[0]?.done ?? 0;

    let progress = 0;
    if (total > 0) {
      progress = Math.round((done / total) * 100);
      progress = Math.max(0, Math.min(100, progress));
    }

    // Update task progress
    await this.taskRepo.update({ id: taskId }, { progress });

    return progress;
  }
}
