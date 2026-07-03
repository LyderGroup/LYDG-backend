import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ProjectMember } from './project-member.entity';
import { Project } from './project.entity';
import { ProjectWorkflowStep } from './project-workflow-step.entity';
import { Task } from './task.entity';
import { TaskWorkflowValidation } from './task-workflow-validation.entity';
import { ValidationRequest } from './validation-request.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { FcmService } from '../notifications/fcm.service';
import { PROJECT_PERMISSIONS } from './project.permissions';
import { ProjectsRealtimeService } from './projects-realtime.service';

export interface ValidationContext {
  userId: string;
  organizationId: string;
  userPermissions: string[];
  userRoleInProject?: string;
}

export interface SubmitValidationDto {
  taskId: string;
  decision: 'approved' | 'rejected';
  comment?: string;
  rejectedReason?: string;
}

@Injectable()
export class WorkflowValidationService {
  constructor(
    @InjectRepository(TaskWorkflowValidation)
    private readonly validationRepo: Repository<TaskWorkflowValidation>,
    @InjectRepository(ValidationRequest)
    private readonly validationRequestRepo: Repository<ValidationRequest>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(ProjectWorkflowStep)
    private readonly stepRepo: Repository<ProjectWorkflowStep>,
    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>,
    private readonly dataSource: DataSource,
    private readonly notificationService: InAppNotificationService,
    private readonly fcmService: FcmService,
    private readonly realtime: ProjectsRealtimeService,
  ) {}
  /**
   * Trouve une task accessible par le user dans son tenant OU via membership
   * cross-org. Retourne null si introuvable; throw Forbidden si trouvée mais
   * inaccessible.
   */
  private async findTaskAccessibleByUser(
    taskId: string,
    userId: string,
    contextOrgId: string,
    options: { manager?: EntityManager; relations?: string[] } = {},
  ): Promise<Task | null> {
    const repo = options.manager ? options.manager.getRepository(Task) : this.taskRepo;

    // 1) Cas standard : task dans le tenant du user.
    const sameOrg = await repo.findOne({
      where: { id: taskId, organizationId: contextOrgId },
      relations: options.relations,
    });
    if (sameOrg) return sameOrg;

    // 2) Cas cross-org : task dans une autre organisation → autoriser si le
    // user est membre/manager/créateur du projet.
    const anyOrg = await repo.findOne({
      where: { id: taskId },
      relations: options.relations,
    });
    if (!anyOrg) return null;

    const access: Array<{ ok: number }> = await repo.manager.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = p.id AND pm.user_id = $2
      LEFT JOIN module_b_projects.project_managers pma
        ON pma.project_id = p.id AND pma.user_id = $2
      WHERE p.id = $1
        AND p.deleted_at IS NULL
        AND (
          pm.id IS NOT NULL OR pma.id IS NOT NULL
          OR p.manager_id = $2 OR p.created_by = $2
        )
      LIMIT 1
      `,
      [anyOrg.projectId, userId],
    );
    if (access.length === 0) {
      throw new ForbiddenException('Task not accessible in this tenant');
    }
    return anyOrg;
  }

  async assertCanTransition(ctx: ValidationContext, taskId: string): Promise<void> {
    const task = await this.findTaskAccessibleByUser(
      taskId,
      ctx.userId,
      ctx.organizationId,
      { relations: ['currentStep'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (!task.currentStepId) {
      throw new BadRequestException('Task has no current workflow step');
    }

    if (!task.currentStep) {
      throw new BadRequestException('Current workflow step not found');
    }

    const step = task.currentStep;

    // Si l'étape ne requiert pas de validation → passage libre
    if (!step.requiresValidation) {
      return;
    }

    // Chercher une validation approuvée pour cette étape
    const validation = await this.validationRepo.findOne({
      where: {
        taskId,
        stepId: step.id,
        decision: 'approved',
      },
    });

    if (!validation) {
      throw new ForbiddenException(
        `Cette étape "${step.name}" requiert une validation avant de continuer. ` +
          `Rôle requis : ${step.validatorRole ?? 'MANAGER'}`,
      );
    }
  }
 
  async submitValidation(
    ctx: ValidationContext,
    dto: SubmitValidationDto,
  ): Promise<TaskWorkflowValidation> {
    return this.dataSource.transaction(async (em) => {
      // Charger la tâche SANS relation pour le verrouillage pessimiste
      // (PostgreSQL ne permet pas FOR UPDATE avec LEFT JOIN) avant j'avais utiliser FOR UPDATE, et j'ai eu droit a des heurs de debugage
      let task = await em.findOne(Task, {
        where: { id: dto.taskId, organizationId: ctx.organizationId },
        lock: { mode: 'pessimistic_write' },
      });

      // Cas cross-org : task dans une autre organisation mais user membre du
      // projet (multi-département/multi-org). On vérifie l'accès via membership.
      if (!task) {
        const anyOrg = await em.findOne(Task, {
          where: { id: dto.taskId },
          lock: { mode: 'pessimistic_write' },
        });
        if (anyOrg) {
          const access: Array<{ ok: number }> = await em.query(
            `
            SELECT 1 AS ok
            FROM module_b_projects.projects p
            LEFT JOIN module_b_projects.project_members pm
              ON pm.project_id = p.id AND pm.user_id = $2
            LEFT JOIN module_b_projects.project_managers pma
              ON pma.project_id = p.id AND pma.user_id = $2
            WHERE p.id = $1
              AND p.deleted_at IS NULL
              AND (
                pm.id IS NOT NULL OR pma.id IS NOT NULL
                OR p.manager_id = $2 OR p.created_by = $2
              )
            LIMIT 1
            `,
            [anyOrg.projectId, ctx.userId],
          );
          if (access.length === 0) {
            throw new ForbiddenException('Task not accessible in this tenant');
          }
          task = anyOrg;
        }
      }

      if (!task) {
        throw new NotFoundException('Task not found');
      }

      // Charger la relation project séparément si nécessaire
      if (task.projectId) {
        const project = await em.findOne(Project, {
          where: { id: task.projectId },
        });
        if (project) {
          task.project = project;
        }
      }

      // Auto-init : si la task n'a pas encore d'étape de workflow (cas des
      // tasks créées avant le câblage du workflow), on rattache la 1ère
      // étape du workflow du projet — pas d'erreur, juste un setup à la volée.
      if (!task.currentStepId && task.projectId) {
        const firstStep: any = await em.query(
          `
          SELECT s.id, s.workflow_id
          FROM module_b_projects.project_workflow_steps s
          INNER JOIN module_b_projects.project_workflows w ON w.id = s.workflow_id
          WHERE w.project_id = $1
            AND (s.deleted_at IS NULL)
            AND (w.deleted_at IS NULL)
          ORDER BY s.step_order ASC
          LIMIT 1
          `,
          [task.projectId],
        );
        if (firstStep?.[0]?.id) {
          task.workflowId = firstStep[0].workflow_id;
          task.currentStepId = firstStep[0].id;
          await em.update(
            Task,
            { id: task.id },
            { workflowId: task.workflowId, currentStepId: task.currentStepId } as any,
          );
        }
      }

      if (!task.currentStepId) {
        throw new BadRequestException(
          'Cette tâche n\'a pas de workflow configuré. Cliquez d\'abord sur "Étape suivante" pour initialiser le workflow.',
        );
      }

      const step = await em.findOne(ProjectWorkflowStep, {
        where: { id: task.currentStepId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!step) {
        throw new BadRequestException('Workflow step not found');
      }

      if (!step.requiresValidation) {
        throw new BadRequestException('Cette étape ne requiert pas de validation');
      }

      await this.assertValidatorRole(ctx, task, step, em);

      // 4. Vérifier qu'il n'y a pas déjà une validation pour cet user/step
      const existingValidation = await em.findOne(TaskWorkflowValidation, {
        where: {
          taskId: dto.taskId,
          stepId: step.id,
          validatorId: ctx.userId,
        },
      });

      if (existingValidation) {
        throw new ConflictException(
          'Vous avez déjà soumis une validation pour cette étape',
        );
      }

      // 5. Créer la validation
      const validation = em.create(TaskWorkflowValidation, {
        taskId: dto.taskId,
        stepId: step.id,
        organizationId: ctx.organizationId,
        validatorId: ctx.userId,
        decision: dto.decision,
        comment: dto.comment ?? null,
        rejectedReason: dto.decision === 'rejected' ? (dto.rejectedReason ?? null) : null,
        validatedAt: new Date(),
      });

      await em.save(validation);

      // Synchroniser avec ValidationRequest si existante
      const pendingRequest = await em.findOne(ValidationRequest, {
        where: {
          taskId: dto.taskId,
          stepId: step.id,
          status: 'pending',
        },
      });

      if (pendingRequest) {
        pendingRequest.status = dto.decision === 'approved' ? 'approved' : 'rejected';
        pendingRequest.validatedBy = ctx.userId;
        pendingRequest.validatorComment = dto.comment ?? dto.rejectedReason ?? null;
        pendingRequest.validatedAt = new Date();
        await em.save(pendingRequest);
      }

      // Si rejeté ,remettre la tâche en révision + notifier l'assignee
      if (dto.decision === 'rejected') {
        await this.rollbackToPreviousStep(em, task, step);

        // Notifier l'assignee du rejet (non-bloquant)
        if (task.assigneeId) {
          try {
            await this.fcmService.sendToUser(
              task.assigneeId,
              `Validation rejetée: ${task.title}`,
              `L'étape \"${step.name}\" a été rejetée. Raison: ${dto.rejectedReason ?? 'Non spécifiée'}`,
              {
                type: 'validation_rejected',
                taskId: task.id,
                stepId: step.id,
              },
            );
          } catch (notifError) {
            console.error('FCM notification error:', notifError);
          }
        }
      }

      return validation;
    });
  } 
  async getValidationsForTask(
    ctx: ValidationContext,
    taskId: string,
  ): Promise<TaskWorkflowValidation[]> {
    return this.validationRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.validator', 'user')
      .where('v.taskId = :taskId', { taskId })
      .andWhere('v.organizationId = :orgId', { orgId: ctx.organizationId })
      .orderBy('v.createdAt', 'DESC')
      .getMany();
  }

  async isStepValidated(
    taskId: string,
    stepId: string,
  ): Promise<boolean> {
    const validation = await this.validationRepo.findOne({
      where: {
        taskId,
        stepId,
        decision: 'approved',
      },
    });
    return !!validation;
  }
 
  async createValidationRequest(
    ctx: ValidationContext,
    taskId: string,
    message?: string,
  ): Promise<ValidationRequest> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, organizationId: ctx.organizationId },
      relations: ['project', 'currentStep'],
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (!task.currentStepId || !task.currentStep) {
      throw new BadRequestException('Task has no current workflow step');
    }

    const step = task.currentStep;

    if (!step.requiresValidation) {
      throw new BadRequestException('Cette étape ne requiert pas de validation');
    }

    // Vérifier que l'utilisateur est l'assignee ou a les droits de gestion
    const isAssignee = task.assigneeId === ctx.userId;
    const updateOrValidateCodes = [
      ...PROJECT_PERMISSIONS.TASK.UPDATE.ALL_SCOPES,
      ...PROJECT_PERMISSIONS.TASK.VALIDATE.ALL_SCOPES,
    ];
    const hasUpdatePermission = ctx.userPermissions.some(p =>
      updateOrValidateCodes.includes(p),
    );
    
    if (!isAssignee && !hasUpdatePermission) {
      throw new ForbiddenException('Seul l\'assignee ou un gestionnaire peut demander une validation');
    }

    // Vérifier s'il y a déjà une demande en attente
    const existingRequest = await this.validationRequestRepo.findOne({
      where: {
        taskId,
        stepId: step.id,
        status: 'pending',
      },
    });

    if (existingRequest) {
      throw new ConflictException('Une demande de validation est déjà en attente pour cette étape');
    }

    // Créer la demande
    const request = this.validationRequestRepo.create({
      taskId,
      stepId: step.id,
      projectId: task.projectId,
      organizationId: ctx.organizationId,
      requesterId: ctx.userId,
      status: 'pending',
      message: message ?? null,
    });

    const savedRequest = await this.validationRequestRepo.save(request);

    // Ne jamais laisser les notifs faire échouer la feature principale
    try {
      await this.sendValidationRequestNotifications(task, step, ctx.organizationId);
    } catch (notifError) {
      console.error('[WorkflowValidation] Notification error (non-blocking):', notifError);
    }

    // Émission realtime
    this.realtime.emitValidationRequested({
      organizationId: ctx.organizationId,
      projectId: task.projectId,
      taskId: task.id,
      requestId: savedRequest.id,
      stepId: step.id,
      requesterId: ctx.userId,
    });

    return savedRequest;
  }
 
  private async sendValidationRequestNotifications(
    task: Task,
    step: ProjectWorkflowStep,
    organizationId: string,
  ): Promise<void> {
    const project = task.project;
    
    // Guard contre proxy TypeORM non initialisé ou projet manquant
    if (!project?.id) return;

    const validatorIds = new Set<string>();

    // Ajouter le manager du projet
    if (project.managerId) {
      validatorIds.add(project.managerId);
    }

    // Ajouter le créateur du projet
    if (project.createdBy) {
      validatorIds.add(project.createdBy);
    }

    // Ajouter les membres avec rôle MANAGER
    const managers = await this.memberRepo.find({
      where: { projectId: project.id, roleInProject: 'MANAGER' },
    });

    for (const m of managers) {
      validatorIds.add(m.userId);
    }

    // Créer les notifications
    const notifications = Array.from(validatorIds).map(userId => ({
      userId,
      organizationId,
      type: 'validation_request' as const,
      title: `Demande de validation: ${task.title}`,
      message: `L'étape "${step.name}" de la tâche "${task.title}" nécessite votre validation.`,
      data: {
        taskId: task.id,
        projectId: project.id,
        stepId: step.id,
        stepName: step.name,
      },
    }));

    if (notifications.length > 0) {
      await this.notificationService.createMany(notifications);

      // Envoyer aussi les notifications push FCM
      const userIds = Array.from(validatorIds);
      await this.fcmService.sendToUsers(
        userIds,
        `Demande de validation: ${task.title}`,
        `L'étape "${step.name}" nécessite votre validation.`,
        {
          type: 'validation_request',
          taskId: task.id,
          projectId: project.id,
          stepId: step.id,
        },
      );
    }
  }

  /**
   * Récupère les demandes de validation en attente pour un validateur.
   */
  async getPendingValidationRequests(
    ctx: ValidationContext,
  ): Promise<ValidationRequest[]> {
    // Get project IDs where user is a manager or owner
    const managerMemberships = await this.memberRepo.find({
      where: [
        { userId: ctx.userId, roleInProject: 'MANAGER' },
        { userId: ctx.userId, roleInProject: 'OWNER' },
      ],
    });

    const projectIds = managerMemberships.map((m) => m.projectId);
 
    const ownedProjects = await this.dataSource.query(
      `SELECT DISTINCT p.id
       FROM module_b_projects.projects p
       WHERE p.organization_id = $1
         AND (p.created_by = $2 OR p.manager_id = $2)`,
      [ctx.organizationId, ctx.userId],
    ) as Array<{ id: string }>;

    const allProjectIds = new Set([
      ...projectIds,
      ...ownedProjects.map((p) => p.id),
    ]);

    if (allProjectIds.size === 0) {
      return [];
    }

    return this.validationRequestRepo
      .createQueryBuilder('vr')
      .innerJoinAndSelect('vr.task', 't')
      .innerJoinAndSelect('t.project', 'p')
      .innerJoinAndSelect('vr.step', 's')
      .innerJoinAndSelect('vr.requester', 'u')
      .where('vr.projectId IN (:...projectIds)', { projectIds: Array.from(allProjectIds) })
      .andWhere('vr.organizationId = :orgId', { orgId: ctx.organizationId })
      .andWhere('vr.status = :status', { status: 'pending' })
      .orderBy('vr.createdAt', 'ASC')
      .getMany();
  }

  /**
   * Vérifie s'il y a une demande de validation en attente pour une tâche.
   */
  async hasPendingValidationRequest(taskId: string): Promise<boolean> {
    const count = await this.validationRequestRepo.count({
      where: { taskId, status: 'pending' },
    });
    return count > 0;
  }

  /**
   * Approuve une demande de validation et crée la validation.
   */
  async approveValidationRequest(
    ctx: ValidationContext,
    requestId: string,
    comment?: string,
  ): Promise<TaskWorkflowValidation> {
    return this.dataSource.transaction(async (em) => {
      const request = await em.findOne(ValidationRequest, {
        where: { id: requestId },
        relations: ['task', 'step'],
      });

      if (!request) {
        throw new NotFoundException('Validation request not found');
      }

      if (request.status !== 'pending') {
        throw new BadRequestException('Cette demande a déjà été traitée');
      }

      const task = request.task;
      const step = request.step;

      if (!task) {
        throw new NotFoundException('Task not found for validation request');
      }
      if (!step) {
        throw new NotFoundException('Step not found for validation request');
      }

      // Vérifier les droits de validateur
      await this.assertValidatorRole(ctx, task, step, em);

      // Créer la validation
      const validation = em.create(TaskWorkflowValidation, {
        taskId: task.id,
        stepId: step.id,
        organizationId: ctx.organizationId,
        validatorId: ctx.userId,
        decision: 'approved',
        comment: comment ?? null,
        validatedAt: new Date(),
      });

      await em.save(validation);
 
      request.status = 'approved';
      request.validatedBy = ctx.userId;
      request.validatorComment = comment ?? null;
      request.validatedAt = new Date();
      await em.save(request);
 
      if (task.assigneeId) {
        try {
          // Notification in-app
          await this.notificationService.create({
            userId: task.assigneeId,
            organizationId: ctx.organizationId,
            type: 'validation_approved',
            title: `Validation approuvée: ${task.title}`,
            message: `L'étape "${step.name}" a été approuvée. Vous pouvez passer à l'étape suivante.`,
            data: {
              taskId: task.id,
              stepId: step.id,
              projectId: task.projectId,
            },
          });
          // Notification push FCM
          await this.fcmService.sendToUser(
            task.assigneeId,
            `Validation approuvée: ${task.title}`,
            `L'étape "${step.name}" a été approuvée. Vous pouvez passer à l'étape suivante.`,
            {
              type: 'validation_approved',
              taskId: task.id,
              stepId: step.id,
            },
          );
        } catch (notifError) {
          console.error('[WorkflowValidation] Notification error (non-blocking):', notifError);
        }
      }

      // Émission realtime (hors callback notif pour éviter les doubles try)
      this.realtime.emitValidationApproved({
        organizationId: ctx.organizationId,
        projectId: task.projectId,
        taskId: task.id,
        requestId: request.id,
        stepId: step.id,
        requesterId: request.requesterId,
        assigneeId: task.assigneeId,
      });

      return validation;
    });
  }

  async rejectValidationRequest(
    ctx: ValidationContext,
    requestId: string,
    reason: string,
  ): Promise<ValidationRequest> {
    return this.dataSource.transaction(async (em) => {
      const request = await em.findOne(ValidationRequest, {
        where: { id: requestId },
        relations: ['task', 'step'],
      });

      if (!request) {
        throw new NotFoundException('Validation request not found');
      }

      if (request.status !== 'pending') {
        throw new BadRequestException('Cette demande a déjà été traitée');
      }

      const task = request.task;
      const step = request.step;

      // Vérifier les droits de validateur
      await this.assertValidatorRole(ctx, task, step, em);

      // Créer une validation de rejet pour tracer la décision
      const validation = em.create(TaskWorkflowValidation, {
        taskId: task.id,
        stepId: step.id,
        organizationId: ctx.organizationId,
        validatorId: ctx.userId,
        decision: 'rejected',
        comment: null,
        rejectedReason: reason,
        validatedAt: new Date(),
      });

      await em.save(validation);

      // Mettre à jour la demande
      request.status = 'rejected';
      request.validatedBy = ctx.userId;
      request.validatorComment = reason;
      request.validatedAt = new Date();
      await em.save(request);

      // Rollback vers l'étape précédente
      const taskWithProject = await em.findOne(Task, {
        where: { id: task.id },
        relations: ['project'],
      });
      if (taskWithProject) {
        task.project = taskWithProject.project;
      }
      await this.rollbackToPreviousStep(em, task, step);

      // Notifier l'assignee du rejet (non-bloquant)
      if (task.assigneeId) {
        try {
          // Notification in-app
          await this.notificationService.create({
            userId: task.assigneeId,
            organizationId: ctx.organizationId,
            type: 'validation_rejected',
            title: `Validation rejetée: ${task.title}`,
            message: `L'étape "${step.name}" a été rejetée. Raison: ${reason}`,
            data: {
              taskId: task.id,
              stepId: step.id,
              projectId: task.projectId,
            },
          });
          // Notification push FCM
          await this.fcmService.sendToUser(
            task.assigneeId,
            `Validation rejetée: ${task.title}`,
            `L'étape "${step.name}" a été rejetée. Raison: ${reason}`,
            {
              type: 'validation_rejected',
              taskId: task.id,
              stepId: step.id,
            },
          );
        } catch (notifError) {
          console.error('[WorkflowValidation] Notification error (non-blocking):', notifError);
        }
      }

      // Émission realtime
      this.realtime.emitValidationRejected({
        organizationId: ctx.organizationId,
        projectId: task.projectId,
        taskId: task.id,
        requestId: request.id,
        stepId: step.id,
        reason,
        requesterId: request.requesterId,
        assigneeId: task.assigneeId,
      });

      return request;
    });
  }

  /**
   * Approuve la demande de validation en attente pour une tâche (par taskId).
   */
  async approveValidationRequestByTaskId(
    ctx: ValidationContext,
    taskId: string,
    comment?: string,
  ): Promise<TaskWorkflowValidation> {
    // Trouver la demande de validation en attente pour cette tâche
    const request = await this.validationRequestRepo.findOne({
      where: { taskId, status: 'pending' },
      relations: ['task', 'step'],
    });

    if (!request) {
      throw new NotFoundException('Aucune demande de validation en attente pour cette tâche');
    }

    return this.approveValidationRequest(ctx, request.id, comment);
  }

  /**
   * Rejette la demande de validation en attente pour une tâche (par taskId).
   */
  async rejectValidationRequestByTaskId(
    ctx: ValidationContext,
    taskId: string,
    reason?: string,
  ): Promise<ValidationRequest> {
    // Trouver la demande de validation en attente pour cette tâche
    const request = await this.validationRequestRepo.findOne({
      where: { taskId, status: 'pending' },
      relations: ['task', 'step'],
    });

    if (!request) {
      throw new NotFoundException('Aucune demande de validation en attente pour cette tâche');
    }

    return this.rejectValidationRequest(ctx, request.id, reason ?? 'Rejeté sans raison');
  }

  // ─── Private helpers ───────────────────────────────────────────

  private async assertValidatorRole(
    ctx: ValidationContext,
    task: Task,
    step: ProjectWorkflowStep,
    em: EntityManager,
  ): Promise<void> {
    const requiredRole = step.validatorRole ?? 'MANAGER';

    // Cas 1 : permission globale de validation
    if (
      ctx.userPermissions.includes(PROJECT_PERMISSIONS.TASK.VALIDATE.TENANT) ||
      ctx.userPermissions.includes(PROJECT_PERMISSIONS.TASK.VALIDATE.GLOBAL)
    ) {
      return;
    }

    // Cas 2 : permission de validation au niveau projet
    if (ctx.userPermissions.includes(PROJECT_PERMISSIONS.TASK.VALIDATE.PROJECT)) {
      const member = await em.findOne(ProjectMember, {
        where: {
          projectId: task.projectId,
          userId: ctx.userId,
        },
      });

      if (!member) {
        throw new ForbiddenException("Vous n'êtes pas membre de ce projet");
      }

      // Vérifier le rôle requis
      const managerRoles = ['MANAGER', 'MANAGER_OR_OWNER'];
      if (
        managerRoles.includes(requiredRole) &&
        member.roleInProject !== 'MANAGER' &&
        member.roleInProject !== 'OWNER'
      ) {
        // Check if user is project creator or manager via project relation
        const taskWithProject = await em.findOne(Task, {
          where: { id: task.id },
          relations: ['project'],
        });

        const project = taskWithProject?.project;
        if (
          project &&
          (project.createdBy === ctx.userId || project.managerId === ctx.userId)
        ) {
          return; // User is project creator or manager
        }

        throw new ForbiddenException('Rôle MANAGER ou OWNER requis pour valider cette étape');
      }

      return;
    }

    throw new ForbiddenException(
      "Vous n'avez pas les permissions pour valider des tâches",
    );
  }

  private async rollbackToPreviousStep(
    em: EntityManager,
    task: Task,
    currentStep: ProjectWorkflowStep,
  ): Promise<void> {
    // Si pas de workflow, on ne peut pas rollback
    if (!task.workflowId) {
      return;
    }

    // Trouver l'étape précédente du workflow
    const allSteps = await em.find(ProjectWorkflowStep, {
      where: { workflowId: task.workflowId },
      order: { stepOrder: 'ASC' },
    });

    const currentIndex = allSteps.findIndex((s) => s.id === task.currentStepId);

    if (currentIndex > 0) {
      const previousStep = allSteps[currentIndex - 1];
      const prevStepName = String(previousStep.name ?? '').toLowerCase();
      let newStatus = 'revision';
      if (prevStepName === 'en cours') newStatus = 'in_progress';
      else if (prevStepName === 'à faire' || prevStepName === 'draft') newStatus = 'todo';
      else if (prevStepName === 'terminé' || prevStepName === 'done') newStatus = 'completed';
      
      await em.update(Task, task.id, {
        currentStepId: previousStep.id,
        status: newStatus,
      });
    }
  }
}
