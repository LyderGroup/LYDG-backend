import { UnauthorizedException } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as admin from 'firebase-admin';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Organization } from '../organizations/organizations.entity';
import { User } from '../users/user.entity';
import { RbacService } from '../rbac/rbac.service';
import { Role } from '../rbac/role.entity';
import { UserRole } from '../rbac/user-role.entity';

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
    private readonly rbacService: RbacService,
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
  ) { }

  private ensureFirebaseInit(): void {
    if (admin.apps.length > 0) return;

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    let privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      throw new UnauthorizedException('Configuration firebase manquants');
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

    console.log('[TaskCommentsGateway] authenticate - orgCode:', orgCode, 'token length:', token.length);

    if (!token || !orgCode) {
      console.warn('[TaskCommentsGateway] authenticate failed - missing token or orgCode');
      throw new UnauthorizedException('Token ou OrgCode manquant');
    }

    this.ensureFirebaseInit();

    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      throw new UnauthorizedException('token invalide');
    }

    const organization = await this.organizationsRepo.findOne({ where: { nameCode: orgCode } });
    if (!organization?.id) {
      throw new UnauthorizedException('organization invalide');
    }

    const externalId = String(decoded.uid);
    const email = decoded.email ? String(decoded.email) : null;

    let user = await this.usersRepo.findOne({ where: { externalId } });
    if (!user && email) {
      user = await this.usersRepo.findOne({ where: { email } });
    }

    if (!user?.id) {
      throw new UnauthorizedException('utilisateur inconnue');
    }

    client.data.userId = String(user.id);
    client.data.organizationId = String(organization.id);
  }

  async handleConnection(client: AuthedSocket) {
    try {
      await this.authenticate(client);
      console.log('[TaskCommentsGateway] Client connected - userId:', client.data.userId, 'organizationId:', client.data.organizationId);
    } catch (err) {
      console.error('[TaskCommentsGateway] Auth failed:', err);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('notifications.subscribe')
  async subscribeToNotifications(
    @ConnectedSocket() client: AuthedSocket,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const userId = client.data.userId;
    const organizationId = client.data.organizationId;

    console.log('[TaskCommentsGateway] notifications.subscribe - userId:', userId, 'organizationId:', organizationId);

    if (!userId || !organizationId) {
      console.warn('[TaskCommentsGateway] notifications.subscribe unauthorized - client.data:', client.data);
      return { ok: false, reason: 'unauthorized' };
    }

    // Rejoindre la room utilisateur pour les notifications
    await client.join(`user:${userId}:notifications`);

    console.log('[TaskCommentsGateway] notifications.subscribe success for user:', userId);
    return { ok: true };
  }

  @SubscribeMessage('notifications.unsubscribe')
  async unsubscribeFromNotifications(
    @ConnectedSocket() client: AuthedSocket,
  ): Promise<{ ok: true }> {
    const userId = client.data.userId;

    if (userId) {
      await client.leave(`user:${userId}:notifications`);
    }

    return { ok: true };
  }

  /**
   * Émet une notification à un utilisateur spécifique
   */
  emitNotificationToUser(input: { userId: string; event: string; payload: any }) {
    this.server.to(`user:${input.userId}:notifications`).emit(input.event, input.payload);
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

    // Vérifier d'abord les permissions RBAC globales (system role = accès total)
    const hasSystemRole = await this.rbacService.userHasAnySystemRole(userId, organizationId);
    if (hasSystemRole) {
      // Pour les system roles, on join le room de l'organisation de la tâche
      const taskOrg = await this.organizationsRepo.manager.query(
        `SELECT organization_id FROM module_b_projects.tasks WHERE id = $1 LIMIT 1`,
        [taskId],
      );
      const taskOrgId = taskOrg[0]?.organization_id || organizationId;
      await client.join(this.getTaskRoom({ organizationId: taskOrgId, taskId }));
      return { ok: true };
    }

    // Vérifier les permissions de rôle (tenant/global)
    const hasTenantRead = await this.userHasPermission(userId, organizationId, 'projects.task.read.tenant');
    const hasGlobalRead = await this.userHasPermission(userId, organizationId, 'projects.task.read.global');

    if (hasGlobalRead) {
      // Pour global read, on join le room de l'organisation de la tâche
      const taskOrg = await this.organizationsRepo.manager.query(
        `SELECT organization_id FROM module_b_projects.tasks WHERE id = $1 LIMIT 1`,
        [taskId],
      );
      const taskOrgId = taskOrg[0]?.organization_id || organizationId;
      await client.join(this.getTaskRoom({ organizationId: taskOrgId, taskId }));
      return { ok: true };
    }

    if (hasTenantRead) {
      // Vérifier que la tâche appartient bien à l'organisation
      const taskExists = await this.organizationsRepo.manager.query(
        `SELECT 1 AS ok FROM module_b_projects.tasks WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [taskId, organizationId],
      );
      if (taskExists[0]?.ok) {
        await client.join(this.getTaskRoom({ organizationId, taskId }));
        return { ok: true };
      }
    }

    // Vérification cross-organisation : membre du projet, manager, créateur, ou assigné
    // On ne vérifie plus l'organisation de la tâche, seulement l'appartenance au projet
    const ok = (await this.organizationsRepo.manager.query(
      `
      SELECT t.organization_id AS task_org_id
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
    )) as Array<{ task_org_id?: string }>;

    if (!ok[0]?.task_org_id) {
      return { ok: false, reason: 'not_found' };
    }

    // Join le room de l'organisation de la tâche (pas celle du client)
    await client.join(this.getTaskRoom({ organizationId: ok[0].task_org_id, taskId }));
    return { ok: true };
  }

  /**
   * Vérifie si un utilisateur a une permission spécifique via son rôle.
   */
  private async userHasPermission(
    userId: string,
    organizationId: string,
    permissionCode: string,
  ): Promise<boolean> {
    const result = await this.userRolesRepo
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'r')
      .innerJoin('r.rolePermissions', 'rp')
      .innerJoin('rp.permission', 'p')
      .where('ur.userId = :userId', { userId })
      .andWhere('ur.isActive = true')
      .andWhere('(ur.expiresAt IS NULL OR ur.expiresAt > NOW())')
      .andWhere('r.isActive = true')
      .andWhere('p.code = :permissionCode', { permissionCode })
      .andWhere('(r.organizationId = :orgId OR r.isSystemRole = true)', { orgId: organizationId })
      .limit(1)
      .getOne();

    return !!result;
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
