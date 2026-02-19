import { UnauthorizedException } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as admin from 'firebase-admin';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Organization } from '../organizations/organizations.entity';
import { User } from '../users/user.entity';
import { ProjectComment } from './project-comment.entity';

type AuthedSocket = Socket & {
  data: {
    userId?: string;
    organizationId?: string;
  };
};

@WebSocketGateway({
  namespace: '/rt',
  cors: { origin: true, credentials: true },
})
export class ProjectCommentsGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(ProjectComment)
    private readonly projectCommentsRepo: Repository<ProjectComment>,
  ) {}

  private ensureFirebaseInit(): void {
    if (admin.apps.length > 0) return;

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    let privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      throw new UnauthorizedException('Missing Firebase service account configuration');
    }

    privateKey = privateKey.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  private async authenticate(client: AuthedSocket): Promise<void> {
    const auth = (client.handshake as any)?.auth ?? {};
    const token = typeof auth?.token === 'string' ? auth.token.trim() : '';
    const orgCode = typeof auth?.orgCode === 'string' ? auth.orgCode.trim() : '';

    if (!token || !orgCode) {
      throw new UnauthorizedException('Missing token or orgCode');
    }

    this.ensureFirebaseInit();

    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const organization = await this.organizationsRepo.findOne({ where: { nameCode: orgCode } });
    if (!organization?.id) {
      throw new UnauthorizedException('Invalid organization');
    }

    const externalId = String(decoded.uid);
    const email = decoded.email ? String(decoded.email) : null;

    let user = await this.usersRepo.findOne({ where: { externalId } });
    if (!user && email) {
      user = await this.usersRepo.findOne({ where: { email } });
    }

    if (!user?.id) {
      throw new UnauthorizedException('Unknown user');
    }

    client.data.userId = String(user.id);
    client.data.organizationId = String(organization.id);
  }

  async handleConnection(client: AuthedSocket) {
    try {
      await this.authenticate(client);
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('project.join')
  async joinProjectRoom(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { projectId?: string },
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const userId = client.data.userId;
    const organizationId = client.data.organizationId;
    const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';

    if (!userId || !organizationId) return { ok: false, reason: 'unauthorized' };
    if (!projectId) return { ok: false, reason: 'missing projectId' };

    const ok = (await this.organizationsRepo.manager.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members m
        ON m.project_id = p.id
       AND m.user_id = $2
      WHERE p.id = $1
        AND (
          p.organization_id = $3
          OR EXISTS (
            SELECT 1
            FROM module_b_projects.project_organizations po
            WHERE po.project_id = p.id
              AND po.organization_id = $3
          )
        )
        AND (
          m.id IS NOT NULL
          OR p.manager_id = $2
          OR p.created_by = $2
        )
      LIMIT 1
      `,
      [projectId, userId, organizationId],
    )) as Array<{ ok?: number }>;

    if (!ok[0]?.ok) {
      return { ok: false, reason: 'forbidden' };
    }

    await client.join(this.getProjectRoom(projectId));

    const comments = (await this.projectCommentsRepo.manager.query(
      `
      SELECT
        c.id,
        c.project_id AS "projectId",
        c.parent_comment_id AS "parentCommentId",
        c.user_id AS "userId",
        c.content,
        c.content_type AS "contentType",
        c.is_internal AS "isInternal",
        c.visibility,
        c.mentions,
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        CONCAT(COALESCE(u.first_name, ''), CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' ELSE '' END, COALESCE(u.last_name, '')) AS "authorName",
        u.email AS "authorEmail"
      FROM module_b_projects.project_comments c
      LEFT JOIN core.users u ON u.id = c.user_id
      WHERE c.project_id = $1
      ORDER BY c.created_at ASC
      LIMIT 100
      `,
      [projectId],
    )) as any[];

    client.emit('project.comment.snapshot', {
      projectId,
      payload: Array.isArray(comments) ? comments : [],
    });
    return { ok: true };
  }

  @SubscribeMessage('project.leave')
  async leaveProjectRoom(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { projectId?: string },
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const organizationId = client.data.organizationId;
    const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';

    if (!organizationId) return { ok: false, reason: 'unauthorized' };
    if (!projectId) return { ok: false, reason: 'missing projectId' };

    await client.leave(this.getProjectRoom(projectId));
    return { ok: true };
  }

  emitToProjectRoom(input: {
    projectId: string;
    event: 'project.comment.created';
    payload: any;
  }) {
    this.server
      .to(this.getProjectRoom(input.projectId))
      .emit(input.event, {
        projectId: input.projectId,
        payload: input.payload,
      });
  }

  private getProjectRoom(projectId: string): string {
    return `project:${projectId}`;
  }
}
