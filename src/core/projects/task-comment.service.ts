import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskComment } from './task-comment.entity';
import { Task } from './task.entity';
import { Project } from './project.entity';
import { TaskCommentsRealtimeService } from './task-comments.realtime';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { FcmService } from '../notifications/fcm.service';

export interface TaskCommentResult {
  id: string;
  taskId: string;
  parentCommentId: string | null;
  userId: string | null;
  authorName: string | null;
  authorEmail: string | null;
  content: string;
  contentType: string;
  isInternal: boolean;
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class TaskCommentService {
  private readonly logger = new Logger(TaskCommentService.name);

  constructor(
    @InjectRepository(TaskComment)
    private readonly taskCommentsRepo: Repository<TaskComment>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly taskCommentsRealtime: TaskCommentsRealtimeService,
    private readonly inAppNotificationService: InAppNotificationService,
    private readonly fcmService: FcmService,
  ) { }

  async createTaskComment(input: {
    taskId: string;
    userId: string;
    contextOrganizationId: string;
    dto: {
      content: string;
      parentCommentId?: string | null;
      visibility?: string | null;
      isInternal?: boolean | null;
    };
  }): Promise<TaskCommentResult> {
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
      .leftJoinAndSelect('c.user', 'u') // AndSelect : sans lui la relation n'est
      // pas hydratée, `c.user` reste undefined et l'auteur s'affiche
      // « Utilisateur » côté frontend.
      .where('c.id = :id', { id: saved.id })
      .getOne();

    const rawName = withUser?.user
      ? `${withUser.user.firstName ?? ''} ${withUser.user.lastName ?? ''}`.trim()
      : '';
    const authorName = rawName ? rawName : null;

    const payload: TaskCommentResult = {
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

    this.sendTaskCommentNotifications(saved.taskId, input.userId, authorName, content, input.contextOrganizationId)
      .catch(err => this.logger.error('Error sending task comment notifications:', err));

    return payload;
  }

  private async sendTaskCommentNotifications(
    taskId: string,
    authorId: string,
    authorName: string | null,
    content: string,
    organizationId: string,
  ) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId },
      relations: ['project'],
    });

    if (!task) return;

    const recipientIds = new Set<string>();

    // Add assignee
    if (task.assigneeId && task.assigneeId !== authorId) {
      recipientIds.add(task.assigneeId);
    }
    // Add task creator
    if (task.createdBy && task.createdBy !== authorId) {
      recipientIds.add(task.createdBy);
    }
    // Add project manager
    if (task.project?.managerId && task.project.managerId !== authorId) {
      recipientIds.add(task.project.managerId);
    }
    // Add project creator
    if (task.project?.createdBy && task.project.createdBy !== authorId) {
      recipientIds.add(task.project.createdBy);
    }

    // Add project managers from project_managers table
    try {
      const managerRows = (await this.taskRepo.manager.query(
        `
        SELECT pm.user_id
        FROM module_b_projects.project_managers pm
        WHERE pm.project_id = $1
        `,
        [task.projectId],
      )) as Array<{ user_id: string }>;

      for (const row of managerRows || []) {
        if (row.user_id && row.user_id !== authorId) {
          recipientIds.add(row.user_id);
        }
      }
    } catch {
      // Ignore if table doesn't exist
    }

    const title = `Nouveau commentaire sur: ${task.title}`;
    const body = `${authorName || 'Quelqu\'un'} a dit : ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`;
    const orgId = organizationId ?? task.organizationId;

    // Send notifications in parallel
    await Promise.all(
      Array.from(recipientIds).map(recipientId =>
        Promise.all([
          this.inAppNotificationService.create({
            userId: recipientId,
            organizationId: orgId,
            title,
            message: body,
            type: 'task_comment',
            data: { taskId, projectId: task.projectId, authorId },
          }).catch(() => { }),
          this.fcmService.sendToUser(recipientId, title, body, {
            type: 'task_comment',
            taskId,
            projectId: task.projectId,
          }).catch(() => { }),
        ]),
      ),
    );
  }
}
