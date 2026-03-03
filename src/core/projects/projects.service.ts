import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  Repository,
  SelectQueryBuilder,
  EntityManager,
  DataSource,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Organization } from '../organizations/organizations.entity';
import { UserRole } from '../rbac/user-role.entity';
import { ProjectMember } from './project-member.entity';
import { ProjectComment } from './project-comment.entity';
import { Project } from './project.entity';
import { ProjectWorkflow } from './project-workflow.entity';
import { ProjectWorkflowStep } from './project-workflow-step.entity';
import { Subtask } from './subtask.entity';
import { TaskComment } from './task-comment.entity';
import { TaskDependency } from './task-dependency.entity';
import { Task } from './task.entity';
import { TaskCommentsRealtimeService } from './task-comments.realtime';
import { ProjectCommentsRealtimeService } from './project-comments.realtime';
import { WorkflowValidationService } from './workflow-validation.service';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { FcmService } from '../notifications/fcm.service';
import { TaskDependencyService } from './task-dependency.service';
import { TaskWorkflowValidation } from './task-workflow-validation.entity';

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
    @InjectRepository(TaskDependency)
    private readonly taskDependenciesRepo: Repository<TaskDependency>,
    @InjectRepository(Subtask)
    private readonly subtasksRepo: Repository<Subtask>,
    @InjectRepository(TaskComment)
    private readonly taskCommentsRepo: Repository<TaskComment>,
    @InjectRepository(ProjectComment)
    private readonly projectCommentsRepo: Repository<ProjectComment>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>, 
    @InjectRepository(ProjectMember)
    private readonly projectMembersRepo: Repository<ProjectMember>,
    @InjectRepository(ProjectWorkflow)
    private readonly projectWorkflowsRepo: Repository<ProjectWorkflow>,
    @InjectRepository(ProjectWorkflowStep)
    private readonly projectWorkflowStepsRepo: Repository<ProjectWorkflowStep>,
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
    @InjectRepository(TaskWorkflowValidation)
    private readonly taskWorkflowValidationsRepo: Repository<TaskWorkflowValidation>,
    private readonly taskCommentsRealtime: TaskCommentsRealtimeService,
    private readonly projectCommentsRealtime: ProjectCommentsRealtimeService,
    private readonly workflowValidationService: WorkflowValidationService,
    private readonly inAppNotificationService: InAppNotificationService,
    private readonly fcmService: FcmService,
    private readonly taskDependencyService: TaskDependencyService,
    private readonly dataSource: DataSource,
  ) {}

  private async ensureDefaultWorkflowForProject(input: {
    projectId: string;
  }): Promise<{ workflowId: string; firstStepId: string }> {
    const existing = await this.projectWorkflowsRepo.findOne({ where: { projectId: input.projectId } });
    if (existing?.id) {
      const first = await this.projectWorkflowStepsRepo.findOne({
        where: { workflowId: existing.id, stepOrder: 0 },
      });
      if (first?.id) {
        return { workflowId: existing.id, firstStepId: first.id };
      }
    }

    const wf = await this.projectWorkflowsRepo.save(
      this.projectWorkflowsRepo.create({
        projectId: input.projectId,
        name: 'Workflow par défaut',
        isDefault: true,
      }),
    );

    const steps = [
      { name: 'Draft', stepOrder: 0, requiresValidation: false, validatorRole: null, isFinalStep: false },
      { name: 'Review', stepOrder: 1, requiresValidation: false, validatorRole: null, isFinalStep: false },
      { name: 'Approved', stepOrder: 2, requiresValidation: true, validatorRole: 'MANAGER_OR_OWNER', isFinalStep: false },
      { name: 'Done', stepOrder: 3, requiresValidation: true, validatorRole: 'MANAGER_OR_OWNER', isFinalStep: true },
    ];

    const savedSteps = await this.projectWorkflowStepsRepo.save(
      steps.map((s) =>
        this.projectWorkflowStepsRepo.create({
          workflowId: wf.id,
          name: s.name,
          stepOrder: s.stepOrder,
          requiresValidation: s.requiresValidation,
          validatorRole: s.validatorRole,
          isFinalStep: s.isFinalStep,
        }),
      ),
    );

    const first = savedSteps.find((s) => s.stepOrder === 0) ?? savedSteps[0];
    if (!first?.id) {
      throw new InternalServerErrorException('Failed to create default workflow steps');
    }

    return { workflowId: wf.id, firstStepId: first.id };
  }

  private async assertProjectReadableOrThrow(input: {
    projectId: string;
    userId: string;
  }): Promise<{ projectId: string; organizationId: string }> {
    const rows = (await this.projectsRepo.manager.query(
      `
      SELECT p.id AS project_id, p.organization_id AS organization_id
      FROM module_b_projects.projects p
      WHERE p.id = $1
        AND (
          EXISTS (
            SELECT 1
            FROM module_b_projects.project_managers pm
            WHERE pm.project_id = p.id
              AND pm.user_id = $2
          )
          OR EXISTS (
            SELECT 1
            FROM module_b_projects.project_members m
            WHERE m.project_id = p.id
              AND m.user_id = $2
          )
          OR p.manager_id = $2
          OR p.created_by = $2
        )
      LIMIT 1
      `,
      [input.projectId, input.userId],
    )) as Array<{ project_id?: string; organization_id?: string }>;

    const first = rows[0];
    if (first?.project_id) {
      return { projectId: String(rows[0]!.project_id), organizationId: String(rows[0]!.organization_id) };
    }

    const exists = (await this.projectsRepo.manager.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.projects p
      WHERE p.id = $1
      LIMIT 1
      `,
      [input.projectId],
    )) as Array<{ ok?: number }>;

    if (!exists?.[0]?.ok) {
      throw new NotFoundException('Project not found');
    }

    throw new ForbiddenException('Project not accessible');
  }

  private async assertUserIsOwnerOrManagerForProjectOrThrow(input: {
    projectId: string;
    userId: string;
    contextOrganizationId: string;
  }): Promise<void> {
    const rows = (await this.projectsRepo.manager.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = p.id
       AND pm.user_id = $2
      WHERE p.id = $1
        AND p.organization_id = $3
        AND (
          p.created_by = $2
          OR p.manager_id = $2
          OR COALESCE(pm.role_in_project,'') IN ('OWNER','MANAGER')
        )
      LIMIT 1
      `,
      [input.projectId, input.userId, input.contextOrganizationId],
    )) as Array<{ ok?: number }>;

    if (!rows?.[0]?.ok) {
      throw new ForbiddenException('Validation requise: OWNER ou MANAGER');
    }
  }

  async listProjectComments(input: {
    projectId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
  }) {
    await this.assertProjectReadableOrThrow({ projectId: input.projectId, userId: input.userId });

    const rows = await this.projectCommentsRepo
      .createQueryBuilder('c')
      .leftJoin('c.user', 'u')
      .where('c.project_id = :projectId', { projectId: input.projectId })
      .orderBy('c.createdAt', 'ASC')
      .take(500)
      .getMany();

    return rows.map((c) => {
      const rawName = c.user ? `${c.user.firstName ?? ''} ${c.user.lastName ?? ''}`.trim() : '';
      const authorName = rawName ? rawName : null;
      return {
        id: c.id,
        projectId: c.projectId,
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

  async createProjectComment(input: {
    projectId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
    dto: {
      content: string;
    };
  }) {
    await this.assertProjectReadableOrThrow({ projectId: input.projectId, userId: input.userId });

    const content = String(input.dto.content ?? '').trim();
    if (!content) {
      throw new BadRequestException('content is required');
    }

    const comment = this.projectCommentsRepo.create({
      projectId: input.projectId,
      userId: input.userId,
      parentCommentId: null,
      content,
      contentType: 'text',
      visibility: 'public',
      isInternal: true,
      mentions: [],
    });

    const saved = await this.projectCommentsRepo.save(comment);

    const withUser = await this.projectCommentsRepo
      .createQueryBuilder('c')
      .leftJoin('c.user', 'u')
      .where('c.id = :id', { id: saved.id })
      .getOne();

    const rawName = withUser?.user ? `${withUser.user.firstName ?? ''} ${withUser.user.lastName ?? ''}`.trim() : '';
    const authorName = rawName ? rawName : null;

    const payload = {
      id: saved.id,
      projectId: saved.projectId,
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

    this.projectCommentsRealtime.emitCommentCreated({
      projectId: saved.projectId,
      payload,
    });
 
    this.sendProjectCommentNotifications(saved.projectId, input.userId, authorName, content, input.contextOrganizationId)
      .catch(err => console.error('[ProjectsService] Error sending project comment notifications:', err));

    return payload;
  }

  private async sendProjectCommentNotifications(
    projectId: string,
    authorId: string,
    authorName: string | null,
    content: string,
    organizationId: string,
  ) {
    const project = await this.projectsRepo.findOne({
      where: { id: projectId },
    });

    if (!project) return;
 
    const members = await this.projectMembersRepo.find({
      where: { projectId },
      select: ['userId'],
    });

    const recipientIds = new Set<string>(
      members
        .map(m => m.userId)
        .filter(id => id !== authorId)
    );

    const title = `Nouveau message sur le projet: ${project.name}`;
    const body = `${authorName || 'Quelqu\'un'} a dit : ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`;

    for (const recipientId of recipientIds) {
      // In-App
      await this.inAppNotificationService.create({
        userId: recipientId,
        organizationId,
        title,
        message: body,
        type: 'project_comment',
        data: { projectId, authorId },
      }).catch(() => {});

      // FCM (Push)
      await this.fcmService.sendToUser(recipientId, title, body, {
        type: 'project_comment',
        projectId,
      }).catch(() => {});
    }
  }

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

  async listTaskDependencies(input: {
    taskId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
  }) {
    const task = await this.tasksRepo.findOne({
      where: { id: input.taskId, organizationId: input.contextOrganizationId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.assertTaskReadableOrThrow({
      taskId: task.id,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    const deps = await this.taskDependenciesRepo.find({
      where: { taskId: task.id },
      order: { createdAt: 'ASC' },
    });

    return deps.map((d) => ({
      id: d.id,
      taskId: d.taskId,
      dependsOnTaskId: d.dependsOnTaskId,
      dependencyType: d.dependencyType,
      lagDays: d.lagDays,
      createdAt: d.createdAt,
    }));
  }

  async addTaskDependency(input: {
    taskId: string;
    dependsOnTaskId: string;
    dependencyType?: string;
    lagDays?: number;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
  }) {
    if (!input.dependsOnTaskId || !String(input.dependsOnTaskId).trim()) {
      throw new BadRequestException('dependsOnTaskId is required');
    }

    const task = await this.tasksRepo.findOne({
      where: { id: input.taskId, organizationId: input.contextOrganizationId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.assertTaskReadableOrThrow({
      taskId: task.id,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    const writeScope = this.resolveTaskWriteScope(input.permissionCodes);
    if (writeScope === 'project') {
      await this.assertUserIsProjectManagerOrThrow({
        userId: input.userId,
        contextOrganizationId: input.contextOrganizationId,
        projectId: task.projectId,
      });
    } else if (writeScope === 'own') {
      const owns = task.assigneeId === input.userId || task.createdBy === input.userId;
      if (!owns) {
        throw new ForbiddenException('Task not writable');
      }
    }

    if (task.id === input.dependsOnTaskId) {
      throw new BadRequestException('Task cannot depend on itself');
    }

    const dependsOnTask = await this.tasksRepo.findOne({
      where: { id: input.dependsOnTaskId, organizationId: input.contextOrganizationId },
    });
    if (!dependsOnTask) {
      throw new BadRequestException('dependsOnTaskId not found');
    }
    if (dependsOnTask.projectId !== task.projectId) {
      throw new BadRequestException('Dependencies must be within the same project');
    }

    await this.assertNoCircularTaskDependencyOrThrow({
      taskId: task.id,
      dependsOnTaskId: dependsOnTask.id,
      contextOrganizationId: input.contextOrganizationId,
    });

    const dependencyType = input.dependencyType ? String(input.dependencyType) : 'finish_to_start';
    const lagDays = Number.isFinite(input.lagDays as number) ? Number(input.lagDays) : 0;

    const existing = await this.taskDependenciesRepo.findOne({
      where: { taskId: task.id, dependsOnTaskId: dependsOnTask.id, dependencyType },
    });
    if (existing) {
      return {
        id: existing.id,
        taskId: existing.taskId,
        dependsOnTaskId: existing.dependsOnTaskId,
        dependencyType: existing.dependencyType,
        lagDays: existing.lagDays,
        createdAt: existing.createdAt,
      };
    }

    const saved = await this.taskDependenciesRepo.save(
      this.taskDependenciesRepo.create({
        taskId: task.id,
        dependsOnTaskId: dependsOnTask.id,
        dependencyType,
        lagDays,
      }),
    );

    return {
      id: saved.id,
      taskId: saved.taskId,
      dependsOnTaskId: saved.dependsOnTaskId,
      dependencyType: saved.dependencyType,
      lagDays: saved.lagDays,
      createdAt: saved.createdAt,
    };
  }

  async removeTaskDependency(input: {
    taskId: string;
    dependsOnTaskId: string;
    dependencyType?: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
  }) {
    const task = await this.tasksRepo.findOne({
      where: { id: input.taskId, organizationId: input.contextOrganizationId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.assertTaskReadableOrThrow({
      taskId: task.id,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    const writeScope = this.resolveTaskWriteScope(input.permissionCodes);
    if (writeScope === 'project') {
      await this.assertUserIsProjectManagerOrThrow({
        userId: input.userId,
        contextOrganizationId: input.contextOrganizationId,
        projectId: task.projectId,
      });
    } else if (writeScope === 'own') {
      const owns = task.assigneeId === input.userId || task.createdBy === input.userId;
      if (!owns) {
        throw new ForbiddenException('Task not writable');
      }
    }

    const dependencyType = input.dependencyType ? String(input.dependencyType) : undefined;

    if (dependencyType) {
      await this.taskDependenciesRepo.delete({
        taskId: task.id,
        dependsOnTaskId: input.dependsOnTaskId,
        dependencyType,
      });
    } else {
      await this.taskDependenciesRepo.delete({
        taskId: task.id,
        dependsOnTaskId: input.dependsOnTaskId,
      });
    }

    return { deleted: true };
  }

  private async assertNoCircularTaskDependencyOrThrow(input: {
    taskId: string;
    dependsOnTaskId: string;
    contextOrganizationId: string;
  }) {
    const rows = (await this.tasksRepo.manager.query(
      `
      WITH RECURSIVE dep_path AS (
        SELECT td.task_id, td.depends_on_task_id
        FROM module_b_projects.task_dependencies td
        INNER JOIN module_b_projects.tasks t ON t.id = td.task_id
        WHERE t.organization_id = $1
          AND td.task_id = $2

        UNION ALL

        SELECT td2.task_id, td2.depends_on_task_id
        FROM module_b_projects.task_dependencies td2
        INNER JOIN dep_path p ON p.depends_on_task_id = td2.task_id
        INNER JOIN module_b_projects.tasks t2 ON t2.id = td2.task_id
        WHERE t2.organization_id = $1
      )
      SELECT 1 AS ok
      FROM dep_path
      WHERE depends_on_task_id = $3
      LIMIT 1
      `,
      [input.contextOrganizationId, input.dependsOnTaskId, input.taskId],
    )) as Array<{ ok?: number }>;

    if (rows?.[0]?.ok) {
      throw new BadRequestException('Circular dependency detected');
    }
  }

  private async assertTaskDependenciesResolvedOrThrow(input: {
    taskId: string;
    contextOrganizationId: string;
  }) {
    const blockers = (await this.tasksRepo.manager.query(
      `
      SELECT d.depends_on_task_id AS "dependsOnTaskId",
             t.status AS "status",
             s.is_final_step AS "isFinalStep"
      FROM module_b_projects.task_dependencies d
      INNER JOIN module_b_projects.tasks t ON t.id = d.depends_on_task_id
      LEFT JOIN module_b_projects.project_workflow_steps s ON s.id = t.current_step_id
      WHERE d.task_id = $1
        AND t.organization_id = $2
        AND (COALESCE(s.is_final_step, false) = false)
        AND (t.status IS NULL OR t.status <> 'completed')
      LIMIT 20
      `,
      [input.taskId, input.contextOrganizationId],
    )) as Array<{ dependsOnTaskId?: string }>;

    if (blockers.length > 0) {
      throw new BadRequestException('Task has unresolved dependencies');
    }
  }

  async moveTaskToNextWorkflowStep(input: {
    taskId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
  }) {
    const task = await this.tasksRepo.findOne({
      where: { id: input.taskId, organizationId: input.contextOrganizationId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.assertTaskReadableOrThrow({
      taskId: task.id,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    if (!task.workflowId || !task.currentStepId) {
      const wf = await this.ensureDefaultWorkflowForProject({ projectId: task.projectId });
      task.workflowId = wf.workflowId;
      task.currentStepId = wf.firstStepId;
      await this.tasksRepo.update(
        { id: task.id, organizationId: input.contextOrganizationId },
        { workflowId: task.workflowId, currentStepId: task.currentStepId } as QueryDeepPartialEntity<Task>,
      );
    }

    const current = await this.projectWorkflowStepsRepo.findOne({ where: { id: task.currentStepId } });
    if (!current) {
      throw new BadRequestException('Invalid current workflow step');
    }

    // NEW: Check workflow validation before transition
    // If current step requires validation, ensure an approved validation exists
    await this.workflowValidationService.assertCanTransition(
      {
        userId: input.userId,
        organizationId: input.contextOrganizationId,
        userPermissions: input.permissionCodes,
      },
      task.id,
    );

    const next = await this.projectWorkflowStepsRepo.findOne({
      where: { workflowId: task.workflowId!, stepOrder: current.stepOrder + 1 },
    });
    if (!next) {
      throw new BadRequestException('No next workflow step (already final)');
    }

    // NEW: Check dependencies are satisfied before ANY transition (not just final step)
    await this.taskDependencyService.assertDependenciesSatisfied(
      task.id,
      input.contextOrganizationId,
    );
 
    let statusPatch: string | undefined;
    const stepName = String(next.name ?? '').toLowerCase();
    if (next.isFinalStep || stepName === 'done') statusPatch = 'completed';
    else if (stepName === 'approved') statusPatch = 'approved';
    else if (stepName === 'review' || stepName.includes('review')) statusPatch = 'review';
    else if (stepName === 'draft') statusPatch = 'todo';

    await this.tasksRepo.update(
      { id: task.id, organizationId: input.contextOrganizationId },
      {
        currentStepId: next.id,
        ...(statusPatch ? { status: statusPatch } : {}),
      } as QueryDeepPartialEntity<Task>,
    );

    return {
      taskId: task.id,
      workflowId: task.workflowId,
      fromStepId: current.id,
      toStepId: next.id,
      toStepName: next.name,
      isFinalStep: next.isFinalStep,
      status: statusPatch ?? task.status,
    };
  }

  async getTaskWorkflowState(input: {
    taskId: string;
    userId: string;
    contextOrganizationId: string;
    permissionCodes: string[];
  }) {
    let task = await this.tasksRepo.findOne({
      where: { id: input.taskId, organizationId: input.contextOrganizationId },
    });
    if (!task) {
      const anyOrg = await this.tasksRepo.findOne({ where: { id: input.taskId } });
      if (anyOrg?.id) {
        throw new ForbiddenException('Task not accessible in this tenant');
      }
      throw new NotFoundException('Task not found');
    }

    await this.assertTaskReadableOrThrow({
      taskId: task.id,
      userId: input.userId,
      contextOrganizationId: input.contextOrganizationId,
      permissionCodes: input.permissionCodes,
    });

    if (!task.workflowId || !task.currentStepId) {
      const wf = await this.ensureDefaultWorkflowForProject({ projectId: task.projectId });
      task.workflowId = wf.workflowId;
      task.currentStepId = wf.firstStepId;
      await this.tasksRepo.update(
        { id: task.id, organizationId: input.contextOrganizationId },
        { workflowId: task.workflowId, currentStepId: task.currentStepId } as QueryDeepPartialEntity<Task>,
      );
    }

    const current = await this.projectWorkflowStepsRepo.findOne({ where: { id: task.currentStepId! } });
    const steps = await this.projectWorkflowStepsRepo.find({
      where: { workflowId: task.workflowId! },
      order: { stepOrder: 'ASC' },
      take: 100,
    });

    return {
      taskId: task.id,
      projectId: task.projectId,
      workflowId: task.workflowId,
      currentStepId: task.currentStepId,
      currentStep: current
        ? {
            id: current.id,
            name: current.name,
            stepOrder: current.stepOrder,
            requiresValidation: current.requiresValidation,
            validatorRole: current.validatorRole,
            isFinalStep: current.isFinalStep,
          }
        : null,
      steps: steps.map((s) => ({
        id: s.id,
        name: s.name,
        stepOrder: s.stepOrder,
        requiresValidation: s.requiresValidation,
        validatorRole: s.validatorRole,
        isFinalStep: s.isFinalStep,
      })),
    };
  }

  private normalizeUuidList(input: unknown): string[] {
    const arr = Array.isArray(input) ? input : [];
    return arr
      .map((x) => String(x ?? '').trim())
      .filter((x) => x.length > 0);
  }

  private uniqueStrings(list: string[]): string[] {
    return Array.from(new Set(list.map((x) => String(x))));
  }

  private async userHasAnySystemRole(userId: string, _organizationId: string): Promise<boolean> {
    const rows = (await this.userRolesRepo.manager.query(
      `
      SELECT 1 AS ok
      FROM core.user_roles ur
      INNER JOIN core.roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND r.is_active = true
        AND r.is_system_role = true
      LIMIT 1
      `,
      [userId],
    )) as Array<{ ok?: number }>;

    return !!rows?.[0]?.ok;
  }

  private async userHasAnyRoleInOrgs(input: {
    userId: string;
    organizationIds: string[];
    roleCodes: string[];
  }): Promise<boolean> {
    if (!input.organizationIds.length || !input.roleCodes.length) return false;

    const rows = (await this.userRolesRepo.manager.query(
      `
      SELECT 1 AS ok
      FROM core.user_roles ur
      INNER JOIN core.roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND r.is_active = true
        AND r.code = ANY($2::text[])
        AND r.organization_id = ANY($3::uuid[])
      LIMIT 1
      `,
      [input.userId, input.roleCodes, input.organizationIds],
    )) as Array<{ ok?: number }>;

    return !!rows?.[0]?.ok;
  }

  private async getUserDepartmentIdsInOrg(input: {
    userId: string;
    organizationId: string;
  }): Promise<string[]> { 
    try {
      const rows = (await this.userRolesRepo.manager.query(
        `
        SELECT DISTINCT e.department_id AS "departmentId"
        FROM module_c_rh.employees e
        WHERE e.organization_id = $1
          AND e.user_id = $2
          AND e.department_id IS NOT NULL
        `,
        [input.organizationId, input.userId],
      )) as Array<{ departmentId?: string }>;
      const ids = rows.map((r) => String(r.departmentId ?? '')).filter(Boolean);
      if (ids.length > 0) return this.uniqueStrings(ids);
    } catch { 
    } 
    const fallback = (await this.userRolesRepo.manager.query(
      `
      SELECT (u.metadata->>'department')::text AS "departmentId"
      FROM core.users u
      WHERE u.id = $1 AND u.organization_id = $2
      LIMIT 1
      `,
      [input.userId, input.organizationId],
    )) as Array<{ departmentId?: string | null }>;

    const dept = String(fallback?.[0]?.departmentId ?? '').trim();
    return dept ? [dept] : [];
  }

  async createProjectV2(input: {
    contextOrganizationId: string;
    userId: string;
    permissionCodes: string[];
    dto: {
      name: string;
      code: string;
      description?: string | null;
      startDate?: string | null;
      plannedEndDate?: string | null;
      organizationIds: string[];
      departments: Array<{ organizationId: string; departmentId: string }>;
      managerIds?: string[];
      memberIds?: string[];
    };
  }) {
    if (!input.dto.name || !String(input.dto.name).trim()) {
      throw new BadRequestException('name is required');
    }
    if (!input.dto.code || !String(input.dto.code).trim()) {
      throw new BadRequestException('code is required');
    }

    const orgIds = this.uniqueStrings(this.normalizeUuidList(input.dto.organizationIds));
    if (!orgIds.length) {
      throw new BadRequestException('organizationIds is required');
    }

    const departments = Array.isArray(input.dto.departments) ? input.dto.departments : [];
    const deptPairs = departments
      .map((d) => ({
        organizationId: String((d as any)?.organizationId ?? '').trim(),
        departmentId: String((d as any)?.departmentId ?? '').trim(),
      }))
      .filter((d) => d.organizationId && d.departmentId);

    if (!deptPairs.length) {
      throw new BadRequestException('departments is required');
    }
 
    for (const d of deptPairs) {
      if (!orgIds.includes(d.organizationId)) {
        throw new BadRequestException(`Invalid departments: organizationId not in organizationIds (${d.organizationId})`);
      }
    }

    const managerIds = this.uniqueStrings(this.normalizeUuidList(input.dto.managerIds));
    const memberIds = this.uniqueStrings(this.normalizeUuidList(input.dto.memberIds));

    const hasSystemRole = await this.userHasAnySystemRole(input.userId, input.contextOrganizationId);

    if (!hasSystemRole) { 
      const canCreate = await this.userHasAnyRoleInOrgs({
        userId: input.userId,
        organizationIds: orgIds,
        roleCodes: ['COUNTRY_MANAGER', 'DEPARTMENT_MANAGER'],
      });
      if (!canCreate) {
        throw new ForbiddenException('You are not allowed to create projects in the selected organizations');
      }

      const countryManagerRows = (await this.userRolesRepo.manager.query(
        `
        SELECT DISTINCT r.organization_id AS "organizationId"
        FROM core.user_roles ur
        INNER JOIN core.roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          AND r.is_active = true
          AND r.code = 'COUNTRY_MANAGER'
          AND r.organization_id = ANY($2::uuid[])
        `,
        [input.userId, orgIds],
      )) as Array<{ organizationId?: string }>;
      const countryManagerOrgIds = new Set(countryManagerRows.map((r) => String(r.organizationId ?? '')).filter(Boolean));

      for (const orgId of orgIds) {
        if (countryManagerOrgIds.has(orgId)) {
          continue;
        }

        const hasDeptManager = await this.userHasAnyRoleInOrgs({
          userId: input.userId,
          organizationIds: [orgId],
          roleCodes: ['DEPARTMENT_MANAGER'],
        });
        if (!hasDeptManager) {
          throw new ForbiddenException('You are not allowed to include one of the selected organizations');
        }

        const allowedDeptIds = await this.getUserDepartmentIdsInOrg({ userId: input.userId, organizationId: orgId });
        if (!allowedDeptIds.length) {
          throw new ForbiddenException('Department scope is missing for your DEPARTMENT_MANAGER role');
        }

        const requestedDeptIds = deptPairs
          .filter((d) => d.organizationId === orgId)
          .map((d) => d.departmentId);

        const invalid = requestedDeptIds.filter((id) => !allowedDeptIds.includes(id));
        if (invalid.length > 0) {
          throw new ForbiddenException('You are not allowed to select one or more departments in this organization');
        }
      }
    }
 
    for (const d of deptPairs) {
      const rows = (await this.projectsRepo.manager.query(
        `
        SELECT d.id AS id
        FROM module_c_rh.departments d
        WHERE d.id = $1 AND d.organization_id = $2
        LIMIT 1
        `,
        [d.departmentId, d.organizationId],
      )) as Array<{ id?: string }>;
      if (!rows?.[0]?.id) {
        throw new BadRequestException(`Invalid departmentId for organization (${d.organizationId})`);
      }
    }
 
    const primaryOrgId = orgIds.includes(input.contextOrganizationId) ? input.contextOrganizationId : orgIds[0]!;
    const primaryDept =
      deptPairs.find((d) => d.organizationId === primaryOrgId)?.departmentId ??
      deptPairs[0]!.departmentId;
    const primaryManagerId = managerIds[0] ?? null;

    const project = this.projectsRepo.create({
      organizationId: primaryOrgId,
      departmentId: primaryDept,
      name: String(input.dto.name).trim(),
      code: String(input.dto.code).trim(),
      description: input.dto.description ?? null,
      startDate: input.dto.startDate ?? null,
      plannedEndDate: input.dto.plannedEndDate ?? null,
      managerId: primaryManagerId,
      createdBy: input.userId,
    });

    const saved = await this.projectsRepo.save(project);

    try {
      await this.ensureDefaultWorkflowForProject({ projectId: saved.id });
    } catch (e: any) {
      console.error('[createProjectV2] Workflow init failed:', e);
      const msg = String(e?.message ?? e ?? '').trim();
      throw new InternalServerErrorException(
        `Project created but workflow initialization failed. ${msg}`,
      );
    }

    // Link organizations
    try {
      for (const orgId of orgIds) {
        await this.projectsRepo.manager.query(
          `
          INSERT INTO module_b_projects.project_organizations (project_id, organization_id, org_role)
          VALUES ($1, $2, $3)
          ON CONFLICT (project_id, organization_id) DO NOTHING
          `,
          [saved.id, orgId, orgId === primaryOrgId ? 'OWNER' : 'PARTICIPANT'],
        );
      }
    } catch (e: any) {
      console.error('[createProjectV2] Link organizations failed:', e);
    }

    // Link departments
    try {
      for (const d of deptPairs) {
        await this.projectsRepo.manager.query(
          `
          INSERT INTO module_b_projects.project_departments (project_id, organization_id, department_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (project_id, organization_id, department_id) DO NOTHING
          `,
          [saved.id, d.organizationId, d.departmentId],
        );
      }
    } catch (e: any) {
      console.error('[createProjectV2] Link departments failed:', e);
    }

    // Link managers
    try {
      for (const managerId of managerIds) {
        await this.projectsRepo.manager.query(
          `
          INSERT INTO module_b_projects.project_managers (project_id, user_id, manager_role, added_by)
          VALUES ($1, $2, 'LEAD', $3)
          ON CONFLICT (project_id, user_id) DO NOTHING
          `,
          [saved.id, managerId, input.userId],
        );
      }
    } catch (e: any) {
      console.error('[createProjectV2] Link managers failed:', e);
    }

    // Project members
    try {
      const allMemberIds = this.uniqueStrings([...memberIds, ...managerIds, input.userId]);
      for (const userId of allMemberIds) {
        await this.projectMembersRepo.save(
          this.projectMembersRepo.create({
            projectId: saved.id,
            userId,
            roleInProject: managerIds.includes(userId) || userId === input.userId
              ? 'MANAGER'
              : 'MEMBER',
            addedBy: input.userId,
          }),
        );
      }
    } catch (e: any) {
      console.error('[createProjectV2] Project members failed:', e);
    }

    // Envoyer des notifications de création de projet aux membres
    this.sendProjectCreatedNotifications(saved.id, input.userId, saved.name, input.contextOrganizationId)
      .catch(err => console.error('[ProjectsService] Error sending project created notifications:', err));

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

  private async sendProjectCreatedNotifications(
    projectId: string,
    creatorId: string,
    projectName: string,
    organizationId: string,
  ) {
    // Récupérer tous les membres du projet sauf le créateur
    const members = await this.projectMembersRepo.find({
      where: { projectId },
      select: ['userId'],
    });

    const recipientIds = members
      .map(m => m.userId)
      .filter(id => id !== creatorId);

    const title = `Nouveau projet créé: ${projectName}`;
    const body = `Vous avez été ajouté au projet "${projectName}". Cliquez pour voir les détails.`;

    for (const recipientId of recipientIds) {
      // In-App
      await this.inAppNotificationService.create({
        userId: recipientId,
        organizationId,
        title,
        message: body,
        type: 'project_created',
        data: { projectId, creatorId },
      }).catch(() => {});

      // FCM (Push)
      await this.fcmService.sendToUser(recipientId, title, body, {
        type: 'project_created',
        projectId,
      }).catch(() => {});
    }
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

    // Also allow organizations where the user is linked through module_b_projects (member/manager) or tasks.
    try {
      const membershipOrgRows = (await this.projectsRepo.manager.query(
        `
        SELECT DISTINCT p.organization_id AS id
        FROM module_b_projects.project_members pm
        INNER JOIN module_b_projects.projects p ON p.id = pm.project_id
        WHERE pm.user_id = $1
          AND p.organization_id IS NOT NULL
        `,
        [userId],
      )) as Array<{ id?: string | null }>;

      for (const row of membershipOrgRows) {
        const id = String(row?.id ?? '').trim();
        if (id && !organizationsMap.has(id)) {
          // We only need the IDs; the Organization entity will be loaded on demand elsewhere.
          organizationsMap.set(id, { id } as Organization);
        }
      }
    } catch {
      // ignore (schema/module may be missing in some environments)
    }

    try {
      const taskOrgRows = (await this.projectsRepo.manager.query(
        `
        SELECT DISTINCT t.organization_id AS id
        FROM module_b_projects.tasks t
        WHERE (t.assignee_id = $1 OR t.created_by = $1)
          AND t.organization_id IS NOT NULL
        `,
        [userId],
      )) as Array<{ id?: string | null }>;

      for (const row of taskOrgRows) {
        const id = String(row?.id ?? '').trim();
        if (id && !organizationsMap.has(id)) {
          organizationsMap.set(id, { id } as Organization);
        }
      }
    } catch {
      // ignore
    }

    // Also include organizations of projects where user is manager or creator
    try {
      const projectOrgRows = (await this.projectsRepo.manager.query(
        `
        SELECT DISTINCT p.organization_id AS id
        FROM module_b_projects.projects p
        WHERE (p.manager_id = $1 OR p.created_by = $1)
          AND p.organization_id IS NOT NULL
        `,
        [userId],
      )) as Array<{ id?: string | null }>;

      for (const row of projectOrgRows) {
        const id = String(row?.id ?? '').trim();
        if (id && !organizationsMap.has(id)) {
          organizationsMap.set(id, { id } as Organization);
        }
      }
    } catch {
      // ignore
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
    const isCreator = !!(task as any)?.createdBy && String((task as any).createdBy) === input.userId;
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

    if (!hasElevatedWrite && !isAssignee && !isCreator) {
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

    // Envoyer des notifications aux personnes concernées (assigné, créateur, manager)
    this.sendTaskCommentNotifications(saved.taskId, input.userId, authorName, content, input.contextOrganizationId)
      .catch(err => console.error('[ProjectsService] Error sending task comment notifications:', err));

    return payload;
  }

  private async sendTaskCommentNotifications(
    taskId: string,
    authorId: string,
    authorName: string | null,
    content: string,
    organizationId: string,
  ) {
    const task = await this.tasksRepo.findOne({
      where: { id: taskId },
      relations: ['project'],
    });

    if (!task) return;

    const recipientIds = new Set<string>();
    if (task.assigneeId && task.assigneeId !== authorId) recipientIds.add(task.assigneeId);
    if (task.createdBy && task.createdBy !== authorId) recipientIds.add(task.createdBy);
    if (task.project?.managerId && task.project.managerId !== authorId) recipientIds.add(task.project.managerId);
    if (task.project?.createdBy && task.project.createdBy !== authorId) recipientIds.add(task.project.createdBy);

    const title = `Nouveau message sur la tâche: ${task.title}`;
    const body = `${authorName || 'Quelqu\'un'} a dit : ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`;

    for (const recipientId of recipientIds) {
      // In-App
      await this.inAppNotificationService.create({
        userId: recipientId,
        organizationId,
        title,
        message: body,
        type: 'task_comment',
        data: { taskId, authorId },
      }).catch(() => {});

      // FCM (Push)
      await this.fcmService.sendToUser(recipientId, title, body, {
        type: 'task_comment',
        taskId,
      }).catch(() => {});
    }
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
      .where('t.id = :id', { id: input.taskId });

    const hasExplicitReadPermission = input.permissionCodes.some(p => p.startsWith('projects.task.read'));
    
    if (!hasExplicitReadPermission) {
      // Permettre à l'assignee d'accéder à sa tâche
      qb.andWhere(
        `(
          t.assignee_id = :userId
          OR t.created_by = :userId
          OR p.created_by = :userId
          OR p.manager_id = :userId
        )`,
        { userId: input.userId },
      );
    } else if (readScope === 'own') {
      qb.andWhere(
        `(
          t.assignee_id = :userId
          OR t.created_by = :userId
          OR p.created_by = :userId
          OR p.manager_id = :userId
        )`,
        {
          userId: input.userId,
        },
      );
    } else if (readScope === 'project') {
      qb.andWhere(
        `t.project_id IN (
          SELECT p.id
          FROM module_b_projects.projects p
          LEFT JOIN module_b_projects.project_members pm
            ON pm.project_id = p.id
           AND pm.user_id = :userId
          WHERE pm.user_id IS NOT NULL
             OR p.created_by = :userId
             OR p.manager_id = :userId
        )`,
        { userId: input.userId },
      );
    } else if (readScope === 'department' || readScope === 'team') {
    }

    const task = await qb.getOne();
    if (!task) {
      const exists = await this.tasksRepo.findOne({
        where: { id: input.taskId },
      });
      if (!exists) throw new NotFoundException('Task not found');
      throw new ForbiddenException('Task not accessible');
    }

    const taskOrgId = String(task.organizationId ?? '').trim();
    if (!taskOrgId) {
      throw new ForbiddenException('Task organization is missing');
    }

    // Cross-organization access: allow if user is related to the task/project
    // (member, manager, creator, assignee) regardless of their organization
    const isRelatedToTask = await this.isUserRelatedToTask(input.userId, input.taskId);
    
    if (isRelatedToTask) {
      // User is directly related to the task/project, allow access
      return task;
    }

    // For non-related users, enforce organization-based access
    const allowedOrgIds = await this.resolveAccessibleOrganizationIdsForUser(input.userId);
    if (!allowedOrgIds.includes(taskOrgId)) {
      throw new ForbiddenException('Task organization not accessible');
    }

    // For department/team scopes, apply the org-specific constraints using the task's organization.
    if (readScope === 'department' || readScope === 'team') {
      const rh = await this.resolveRhContextForUser({
        userId: input.userId,
        organizationId: taskOrgId,
      });

      if (!rh) {
        if (task.assigneeId !== input.userId && task.createdBy !== input.userId) {
          throw new ForbiddenException('Task not accessible');
        }
      } else if (readScope === 'department') {
        if (!rh.departmentId) {
          if (task.assigneeId !== input.userId && task.createdBy !== input.userId) {
            throw new ForbiddenException('Task not accessible');
          }
        } else {
          const rows = (await this.tasksRepo.manager.query(
            `
            SELECT 1 AS ok
            WHERE (
              $1::uuid IN (
                SELECT e.user_id
                FROM module_c_rh.employees e
                WHERE e.organization_id = $3
                  AND e.department_id = $2
              )
              OR $1::uuid IN (
                SELECT e.user_id
                FROM module_c_rh.employees e
                WHERE e.organization_id = $3
                  AND e.department_id = $2
              )
            )
            LIMIT 1
            `,
            [task.assigneeId ?? task.createdBy, rh.departmentId, taskOrgId],
          )) as Array<{ ok?: number }>;

          // If task has no assignee, fallback to created_by checks
          if (!rows?.[0]?.ok) {
            const ok =
              (task.assigneeId &&
                (await this.tasksRepo.manager.query(
                  `
                  SELECT 1 AS ok
                  FROM module_c_rh.employees e
                  WHERE e.organization_id = $1
                    AND e.department_id = $2
                    AND e.user_id = $3
                  LIMIT 1
                  `,
                  [taskOrgId, rh.departmentId, task.assigneeId],
                ))?.[0]?.ok) ||
              (await this.tasksRepo.manager.query(
                `
                SELECT 1 AS ok
                FROM module_c_rh.employees e
                WHERE e.organization_id = $1
                  AND e.department_id = $2
                  AND e.user_id = $3
                LIMIT 1
                `,
                [taskOrgId, rh.departmentId, task.createdBy],
              ))?.[0]?.ok;

            if (!ok) {
              throw new ForbiddenException('Task not accessible');
            }
          }
        }
      } else {
        // team scope: keep existing safe fallback (own) when hierarchy context isn't reliable
        // if RH data is present but we cannot safely assert hierarchy, allow own only.
        if (task.assigneeId !== input.userId && task.createdBy !== input.userId) {
          throw new ForbiddenException('Task not accessible');
        }
      }
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

    const wf = await this.ensureDefaultWorkflowForProject({ projectId: project.id });
    task.workflowId = wf.workflowId;
    task.currentStepId = wf.firstStepId;

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

    // NEW: If changing status to in_progress or beyond, check dependencies are satisfied
    if (input.dto.status && input.dto.status !== 'todo' && input.dto.status !== 'pending') {
      await this.taskDependencyService.assertDependenciesSatisfied(
        input.id,
        input.contextOrganizationId,
      );
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
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = p.id
       AND pm.user_id = $1
      WHERE p.id = $2
        AND p.organization_id = $3
        AND (pm.user_id IS NOT NULL OR p.created_by = $1)
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
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = p.id
       AND pm.user_id = $1
      WHERE p.id = $2
        AND p.organization_id = $3
        AND (
          p.created_by = $1
          OR (
            pm.user_id IS NOT NULL
            AND pm.role_in_project = 'MANAGER'
          )
        )
      LIMIT 1
      `,
      [input.userId, input.projectId, input.contextOrganizationId],
    )) as Array<{ ok?: number }>;

    if (!rows[0]?.ok) {
      throw new ForbiddenException('User is not a manager of this project');
    }
  }

  /**
   * Vérifie si un utilisateur est lié à une tâche (cross-organisation).
   * Un utilisateur est lié s'il est: membre du projet, manager du projet, créateur du projet, assigné à la tâche, ou créateur de la tâche.
   */
  private async isUserRelatedToTask(userId: string, taskId: string): Promise<boolean> {
    const rows = (await this.tasksRepo.manager.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.tasks t
      INNER JOIN module_b_projects.projects p ON p.id = t.project_id
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = t.project_id
       AND pm.user_id = $2
      WHERE t.id = $1
        AND (
          pm.id IS NOT NULL
          OR p.created_by = $2
          OR p.manager_id = $2
          OR t.assignee_id = $2
          OR t.created_by = $2
        )
      LIMIT 1
      `,
      [taskId, userId],
    )) as Array<{ ok?: number }>;

    return !!rows[0]?.ok;
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
      readScope === 'global' ||
      readScope === 'tenant' ||
      readScope === 'project' ||
      readScope === 'own'
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
          SELECT p.id
          FROM module_b_projects.projects p
          LEFT JOIN module_b_projects.project_members pm
            ON pm.project_id = p.id
           AND pm.user_id = :userId
          WHERE pm.user_id IS NOT NULL
             OR p.created_by = :userId
             OR p.manager_id = :userId
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
