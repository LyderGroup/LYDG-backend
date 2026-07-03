import { Logger, UnauthorizedException } from '@nestjs/common';
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
import { corsOriginCallback } from '../security/cors.config';

type AuthedSocket = Socket & {
  data: {
    userId?: string;
    organizationId?: string;
  };
};

@WebSocketGateway({
  namespace: '/rt',
  cors: {
    origin: corsOriginCallback,
    credentials: true,
  },
})
export class TaskCommentsGateway {
  private readonly logger = new Logger(TaskCommentsGateway.name);
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

    if (!token || !orgCode) {
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
    } catch (err) {
      this.logger.warn(`Auth WebSocket refusée: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('notifications.subscribe')
  async subscribeToNotifications(
    @ConnectedSocket() client: AuthedSocket,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const userId = client.data.userId;
    const organizationId = client.data.organizationId;
 

    if (!userId || !organizationId) {
      
      return { ok: false, reason: 'unauthorized' };
    }

    await client.join(`user:${userId}:notifications`);
 
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

    // Plus de rôle système - vérifier la permission project.read.all
    const hasAllProjectsPermission = await this.userHasPermission(userId, organizationId, 'project.read.all');
    if (hasAllProjectsPermission) {
      // Pour les users avec project.read.all, on join le room de l'organisation de la tâche
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
      .andWhere('r.organizationId = :orgId', { orgId: organizationId })
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

  // ──────────── HR realtime ────────────
  //
  // Rooms HR génériques : `org:${orgId}:hr:${scope}`. Le scope identifie
  // le sous-domaine (attendance, leave, journal, overtime, discipline,
  // events, performance, training). Plus une room par utilisateur
  // `user:${userId}:hr` pour les events qui concernent un employé précis.
  //
  // Les permissions sont vérifiées au join : un utilisateur sans
  // hr.attendance.read.all ne peut pas écouter le room attendance org-wide
  // (il reçoit seulement les events qui le concernent via user:hr).

  private readonly HR_SCOPE_PERMISSIONS: Record<string, string[]> = {
    attendance: ['hr.attendance.read.all', 'hr.attendance.manage', 'hr.attendance.read.team'],
    leave: ['hr.leave.read.all', 'hr.leave.approve', 'hr.leave.read.team'],
    journal: ['journal.read_all', 'journal.read_team'],
    overtime: ['hr.attendance.read.all', 'hr.attendance.manage'],
    discipline: ['hr.sanctions.read.all', 'hr.attendance.manage', 'hr.sanctions.write'],
    events: ['hr.internal-life.read.all', 'hr.internal-life.manage', 'hr.internal-life.read.own'],
    performance: ['hr.evaluation.read.all', 'hr.evaluation.write'],
    training: ['hr.training.read.all', 'hr.training.write'],
  };

  @SubscribeMessage('hr.subscribe')
  async subscribeToHr(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { scope?: string },
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const userId = client.data.userId;
    const organizationId = client.data.organizationId;
    const scope = typeof body?.scope === 'string' ? body.scope.trim().toLowerCase() : '';

    if (!userId || !organizationId) return { ok: false, reason: 'unauthorized' };
    if (!scope) return { ok: false, reason: 'missing scope' };

    const required = this.HR_SCOPE_PERMISSIONS[scope];
    if (!required) return { ok: false, reason: 'unknown scope' };

    // Vérifie qu'au moins UNE des permissions requises est présente. Si
    // aucune n'est satisfaite, on rejette (l'utilisateur recevra quand
    // même ses events personnels via la room user:${id}:hr s'il s'y joint).
    const hasAny = await this.userHasAnyPermission(userId, organizationId, required);
    if (!hasAny) return { ok: false, reason: 'forbidden' };

    await client.join(this.getHrRoom({ organizationId, scope }));
    return { ok: true };
  }

  @SubscribeMessage('hr.unsubscribe')
  async unsubscribeFromHr(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { scope?: string },
  ): Promise<{ ok: true }> {
    const organizationId = client.data.organizationId;
    const scope = typeof body?.scope === 'string' ? body.scope.trim().toLowerCase() : '';
    if (organizationId && scope) {
      await client.leave(this.getHrRoom({ organizationId, scope }));
    }
    return { ok: true };
  }

  /**
   * Join la room personnelle de l'utilisateur (pour ses propres events RH :
   * confirmation d'un check-in, sanction reçue, congé approuvé, etc.).
   */
  @SubscribeMessage('hr.subscribe.personal')
  async subscribeToPersonalHr(
    @ConnectedSocket() client: AuthedSocket,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const userId = client.data.userId;
    if (!userId) return { ok: false, reason: 'unauthorized' };
    await client.join(this.getPersonalHrRoom(userId));
    return { ok: true };
  }

  /** Émission vers une room HR (appelé par HrRealtimeService). */
  emitToHrRoom(input: {
    organizationId: string;
    scope: string;
    event: string;
    payload: any;
  }) {
    this.server
      .to(this.getHrRoom({ organizationId: input.organizationId, scope: input.scope }))
      .emit(input.event, input.payload);
  }

  /** Émission vers la room personnelle d'un utilisateur. */
  emitToUserHr(input: { userId: string; event: string; payload: any }) {
    this.server.to(this.getPersonalHrRoom(input.userId)).emit(input.event, input.payload);
  }

  private getHrRoom(input: { organizationId: string; scope: string }): string {
    return `org:${input.organizationId}:hr:${input.scope}`;
  }

  private getPersonalHrRoom(userId: string): string {
    return `user:${userId}:hr`;
  }

  /** Vérifie qu'au moins une des permissions est présente. */
  private async userHasAnyPermission(
    userId: string,
    organizationId: string,
    permissionCodes: string[],
  ): Promise<boolean> {
    if (permissionCodes.length === 0) return false;
    const result = await this.userRolesRepo
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'r')
      .innerJoin('r.rolePermissions', 'rp')
      .innerJoin('rp.permission', 'p')
      .where('ur.userId = :userId', { userId })
      .andWhere('ur.isActive = true')
      .andWhere('(ur.expiresAt IS NULL OR ur.expiresAt > NOW())')
      .andWhere('r.isActive = true')
      .andWhere('p.code IN (:...codes)', { codes: permissionCodes })
      .andWhere('(r.organizationId = :orgId OR r.organizationId IS NULL)', { orgId: organizationId })
      .limit(1)
      .getOne();
    return !!result;
  }

  // ──────────── Projets realtime ────────────
  //
  // Rooms Projets génériques :
  //   - `org:${orgId}:projects:${scope}` (org-wide)
  //   - `project:${projectId}` (par projet, pour les détails)
  //   - `user:${userId}:projects` (events qui concernent un user précis)
  //
  // Les scopes sont alignés avec PROJECT_PERMISSIONS (cf project.permissions.ts) :
  //   tasks, validations, members, dependencies, workflows.

  private readonly PROJECTS_SCOPE_PERMISSIONS: Record<string, string[]> = {
    tasks: [
      'projects.task.read.tenant',
      'projects.task.read.global',
      'projects.task.read.department',
      'projects.task.read.team',
      'projects.task.read.project',
      'projects.task.control_tower.tenant',
    ],
    validations: [
      'projects.task.validate.tenant',
      'projects.task.validate.global',
      'projects.task.validate.department',
      'projects.task.validate.team',
      'projects.task.validate.project',
    ],
    members: [
      'projects.member.read.tenant',
      'projects.member.read.global',
      'projects.member.add.tenant',
      'projects.member.remove.tenant',
    ],
    dependencies: [
      'projects.dependency.read.tenant',
      'projects.dependency.read.project',
    ],
    workflows: [
      'projects.workflow.read.tenant',
      'projects.workflow.read.project',
      'projects.workflow.manage.tenant',
      'projects.workflow.manage.project',
    ],
  };

  @SubscribeMessage('projects.subscribe')
  async subscribeToProjects(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { scope?: string },
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const userId = client.data.userId;
    const organizationId = client.data.organizationId;
    const scope = typeof body?.scope === 'string' ? body.scope.trim().toLowerCase() : '';

    if (!userId || !organizationId) return { ok: false, reason: 'unauthorized' };
    if (!scope) return { ok: false, reason: 'missing scope' };

    const required = this.PROJECTS_SCOPE_PERMISSIONS[scope];
    if (!required) return { ok: false, reason: 'unknown scope' };

    const hasAny = await this.userHasAnyPermission(userId, organizationId, required);
    if (!hasAny) return { ok: false, reason: 'forbidden' };

    await client.join(this.getProjectsRoom({ organizationId, scope }));
    return { ok: true };
  }

  @SubscribeMessage('projects.unsubscribe')
  async unsubscribeFromProjects(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { scope?: string },
  ): Promise<{ ok: true }> {
    const organizationId = client.data.organizationId;
    const scope = typeof body?.scope === 'string' ? body.scope.trim().toLowerCase() : '';
    if (organizationId && scope) {
      await client.leave(this.getProjectsRoom({ organizationId, scope }));
    }
    return { ok: true };
  }

  /**
   * S'abonne aux événements d'un projet précis (room ciblée). Vérifie que
   * l'utilisateur est membre/manager/créateur du projet OU a une permission
   * de lecture élargie.
   */
  @SubscribeMessage('projects.subscribe.project')
  async subscribeToProject(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { projectId?: string },
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const userId = client.data.userId;
    const organizationId = client.data.organizationId;
    const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';

    if (!userId || !organizationId) return { ok: false, reason: 'unauthorized' };
    if (!projectId) return { ok: false, reason: 'missing projectId' };

    // Vérif appartenance/permissions élargies via SQL existant
    const access = (await this.organizationsRepo.manager.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = p.id AND pm.user_id = $2
      WHERE p.id = $1
        AND p.deleted_at IS NULL
        AND (
          pm.id IS NOT NULL
          OR p.manager_id = $2
          OR p.created_by = $2
          OR EXISTS (
            SELECT 1
            FROM core.user_roles ur
            INNER JOIN core.roles r ON r.id = ur.role_id
            INNER JOIN core.role_permissions rp ON rp.role_id = r.id
            INNER JOIN core.permissions perm ON perm.id = rp.permission_id
            WHERE ur.user_id = $2
              AND ur.is_active = true
              AND r.is_active = true
              AND perm.code = ANY($3::text[])
          )
        )
      LIMIT 1
      `,
      [
        projectId,
        userId,
        [
          'projects.task.read.tenant',
          'projects.task.read.global',
          'project.read.all',
        ],
      ],
    )) as Array<{ ok?: number }>;

    if (!access[0]?.ok) return { ok: false, reason: 'forbidden' };

    await client.join(this.getProjectRoom({ projectId }));
    return { ok: true };
  }

  @SubscribeMessage('projects.unsubscribe.project')
  async unsubscribeFromProject(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { projectId?: string },
  ): Promise<{ ok: true }> {
    const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';
    if (projectId) {
      await client.leave(this.getProjectRoom({ projectId }));
    }
    return { ok: true };
  }

  /** S'abonne aux events Projets personnels (notifs ciblées). */
  @SubscribeMessage('projects.subscribe.personal')
  async subscribeToPersonalProjects(
    @ConnectedSocket() client: AuthedSocket,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const userId = client.data.userId;
    if (!userId) return { ok: false, reason: 'unauthorized' };
    await client.join(this.getPersonalProjectsRoom(userId));
    return { ok: true };
  }

  /** Émission vers une room scopée org. */
  emitToProjectsRoom(input: {
    organizationId: string;
    scope: string;
    event: string;
    payload: any;
  }) {
    this.server
      .to(this.getProjectsRoom({ organizationId: input.organizationId, scope: input.scope }))
      .emit(input.event, input.payload);
  }

  /** Émission vers la room d'un projet spécifique. */
  emitToProjectRoom(input: { projectId: string; event: string; payload: any }) {
    this.server
      .to(this.getProjectRoom({ projectId: input.projectId }))
      .emit(input.event, input.payload);
  }

  /** Émission vers la room personnelle d'un utilisateur (Projets). */
  emitToUserProjects(input: { userId: string; event: string; payload: any }) {
    this.server
      .to(this.getPersonalProjectsRoom(input.userId))
      .emit(input.event, input.payload);
  }

  private getProjectsRoom(input: { organizationId: string; scope: string }): string {
    return `org:${input.organizationId}:projects:${input.scope}`;
  }

  private getProjectRoom(input: { projectId: string }): string {
    return `project:${input.projectId}`;
  }

  private getPersonalProjectsRoom(userId: string): string {
    return `user:${userId}:projects`;
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
