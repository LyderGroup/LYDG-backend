import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectComment } from './project-comment.entity';
import { Project } from './project.entity';
import { ProjectMember } from './project-member.entity';
import { ProjectCommentsRealtimeService } from './project-comments.realtime';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { FcmService } from '../notifications/fcm.service';

export interface ProjectCommentResult {
  id: string;
  projectId: string;
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
export class ProjectCommentService {
  private readonly logger = new Logger(ProjectCommentService.name);

  constructor(
    @InjectRepository(ProjectComment)
    private readonly projectCommentsRepo: Repository<ProjectComment>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectMember)
    private readonly projectMembersRepo: Repository<ProjectMember>,
    private readonly projectCommentsRealtime: ProjectCommentsRealtimeService,
    private readonly inAppNotificationService: InAppNotificationService,
    private readonly fcmService: FcmService,
  ) { }

  async createProjectComment(input: {
    projectId: string;
    userId: string;
    contextOrganizationId: string;
    dto: {
      content: string;
    };
  }): Promise<ProjectCommentResult> {
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

    const payload: ProjectCommentResult = {
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
      .catch(err => this.logger.error('Error sending project comment notifications:', err));

    return payload;
  }

  private async sendProjectCommentNotifications(
    projectId: string,
    authorId: string,
    authorName: string | null,
    content: string,
    organizationId: string,
  ) {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });

    if (!project) return;

    const members = await this.projectMembersRepo.find({
      where: { projectId },
      select: ['userId'],
    });

    const recipientIds = new Set<string>();
    for (const m of members) {
      if (m.userId && m.userId !== authorId) {
        recipientIds.add(m.userId);
      }
    }

    // Add project creator and manager
    if (project.createdBy && project.createdBy !== authorId) {
      recipientIds.add(project.createdBy);
    }
    if (project.managerId && project.managerId !== authorId) {
      recipientIds.add(project.managerId);
    }

    // Add department managers
    try {
      const deptManagers = (await this.projectRepo.manager.query(
        `
        SELECT e.user_id
        FROM module_c_rh.employees e
        WHERE e.organization_id = $1
          AND e.department_id = $2
          AND e.is_manager = true
        `,
        [organizationId, project.departmentId],
      )) as Array<{ user_id?: string | null }>;

      for (const row of deptManagers || []) {
        if (row.user_id && row.user_id !== authorId) {
          recipientIds.add(row.user_id);
        }
      }
    } catch {
      // Ignore if table doesn't exist
    }

    const title = `Nouveau message sur le projet: ${project.name}`;
    const body = `${authorName || 'Quelqu\'un'} a dit : ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`;
    const orgId = organizationId ?? project.organizationId;

    // Send notifications in parallel
    await Promise.all(
      Array.from(recipientIds).map(recipientId =>
        Promise.all([
          this.inAppNotificationService.create({
            userId: recipientId,
            organizationId: orgId,
            title,
            message: body,
            type: 'project_comment',
            data: { projectId, authorId },
          }).catch(() => { }),
          this.fcmService.sendToUser(recipientId, title, body, {
            type: 'project_comment',
            projectId,
          }).catch(() => { }),
        ]),
      ),
    );
  }
}
