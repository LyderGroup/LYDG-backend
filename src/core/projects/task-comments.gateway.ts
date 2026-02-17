import { UnauthorizedException } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as admin from 'firebase-admin';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Organization } from '../organizations/organizations.entity';
import { User } from '../users/user.entity';

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
export class TaskCommentsGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
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

  @SubscribeMessage('task.join')
  async joinTaskRoom(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { taskId?: string },
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const userId = client.data.userId;
    const organizationId = client.data.organizationId;
    const taskId = typeof body?.taskId === 'string' ? body.taskId.trim() : '';

    if (!userId || !organizationId) return { ok: false, reason: 'unauthorized' };
    if (!taskId) return { ok: false, reason: 'missing taskId' };

    const ok = (await this.organizationsRepo.manager.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.tasks t
      INNER JOIN module_b_projects.projects p ON p.id = t.project_id
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = t.project_id
       AND pm.user_id = $2
      WHERE t.id = $1
        AND t.organization_id = $3
        AND p.organization_id = $3
        AND (
          pm.id IS NOT NULL
          OR p.manager_id = $2
          OR t.assignee_id = $2
          OR t.created_by = $2
        )
      LIMIT 1
      `,
      [taskId, userId, organizationId],
    )) as Array<{ ok?: number }>;

    if (!ok[0]?.ok) {
      return { ok: false, reason: 'forbidden' };
    }

    await client.join(this.getTaskRoom({ organizationId, taskId }));
    return { ok: true };
  }

  @SubscribeMessage('task.leave')
  async leaveTaskRoom(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { taskId?: string },
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const organizationId = client.data.organizationId;
    const taskId = typeof body?.taskId === 'string' ? body.taskId.trim() : '';

    if (!organizationId) return { ok: false, reason: 'unauthorized' };
    if (!taskId) return { ok: false, reason: 'missing taskId' };

    await client.leave(this.getTaskRoom({ organizationId, taskId }));
    return { ok: true };
  }

  emitToTaskRoom(input: {
    organizationId: string;
    taskId: string;
    event: 'task.comment.created';
    payload: any;
  }) {
    this.server.to(this.getTaskRoom({ organizationId: input.organizationId, taskId: input.taskId })).emit(input.event, {
      taskId: input.taskId,
      payload: input.payload,
    });
  }

  private getTaskRoom(input: { organizationId: string; taskId: string }): string {
    return `org:${input.organizationId}:task:${input.taskId}`;
  }
}
