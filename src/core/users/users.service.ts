import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import * as https from 'https';
import * as crypto from 'crypto';
import { User } from './user.entity';
import { LoginHistory } from './login-history.entity';
import { UserRole } from '../rbac/user-role.entity';
import { Role } from '../rbac/role.entity';
interface ListUsersOptions {
  page?: number;
  limit?: number;
  search?: string;
  includeInactive?: boolean;
  roleId?: string;
}

interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  language?: string | null;
  timezone?: string | null;
  department?: string | null;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private firebaseInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(LoginHistory)
    private readonly loginHistoryRepo: Repository<LoginHistory>,
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
  ) { }

  private ensureFirebaseApp(): void {
    if (this.firebaseInitialized && admin.apps.length > 0) {
      return;
    }

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    let privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing Firebase service account configuration');
    }

    privateKey = privateKey.replace(/\\n/g, '\n');

    if (!admin.apps.length) {
      // Custom HTTP agent with better timeout and keep-alive settings
      // to handle Render's egress issues with googleapis.com
      const httpAgent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 5,
        maxFreeSockets: 2,
        timeout: 10000,
        scheduling: 'fifo',
      });

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        httpAgent,
      });
    }

    this.firebaseInitialized = true;
  }

  async findPageForTenant(
    organizationId: string,
    options: ListUsersOptions,
  ): Promise<{ data: User[]; meta: { total: number; page: number; limit: number; pageCount: number } }> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limitRaw = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 20;
    const limit = limitRaw;

    const qb = this.usersRepo
      .createQueryBuilder('u')
      .where('u.organization_id = :orgId', { orgId: organizationId });

    if (!options.includeInactive) {
      qb.andWhere('u.is_active = true AND u.deleted_at IS NULL');
    }

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere(
        'LOWER(u.first_name) LIKE :term OR LOWER(u.last_name) LIKE :term OR LOWER(u.email) LIKE :term',
        { term },
      );
    }

    if (options.roleId) {
      qb.innerJoin(UserRole, 'ur', 'ur.user_id = u.id AND ur.role_id = :roleId AND ur.is_active = true', {
        roleId: options.roleId,
      });
    }

    qb.orderBy('u.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit) || 1,
      },
    };
  }

  async createForTenant(
    organizationId: string,
    currentUserId: string | null,
    payload: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string | null;
      language?: string | null;
      timezone?: string | null;
      department?: string | null;
      roleId?: string | null;
    },
  ): Promise<User> {
    if (!payload.roleId) {
      throw new BadRequestException('Le rôle est obligatoire');
    }

    const role = await this.rolesRepo.findOne({ where: { id: payload.roleId } });
    if (!role) {
      throw new BadRequestException('Rôle invalide');
    }

    // Plus de rôle système - le département est obligatoire pour tous
    if (!payload.department || !String(payload.department).trim()) {
      throw new BadRequestException('Le département est obligatoire');
    }

    // 1) Créer l'utilisateur Firebase d'abord (idempotent : on récupère
    //    l'existant). Si Firebase échoue, la transaction DB est rollback,
    //    évitant les comptes "zombies" sans externalId.
    this.ensureFirebaseApp();
    let firebaseUser: admin.auth.UserRecord | null = null;
    try {
      firebaseUser = await admin.auth().getUserByEmail(payload.email);
    } catch {
      firebaseUser = null;
    }
    if (!firebaseUser) {
      try {
        firebaseUser = await admin.auth().createUser({
          email: payload.email,
          displayName: `${payload.firstName} ${payload.lastName}`.trim(),
          disabled: false,
        });
      } catch (err) {
        throw new BadRequestException(
          `Échec de la création du compte Firebase: ${(err as Error).message}`,
        );
      }
    }
    const externalId = firebaseUser.uid;

    // 2) Création atomique en DB (user + user_role) + lien Firebase UID.
    const savedUser = await this.dataSource.transaction(async (manager) => {
      const usersRepo = manager.getRepository(User);
      const userRolesRepo = manager.getRepository(UserRole);

      const user = usersRepo.create({
        organizationId,
        email: payload.email,
        username: null,
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone ?? null,
        // Mot de passe temporaire aléatoire (l'utilisateur passe par Firebase).
        passwordHash: crypto.randomBytes(32).toString('hex'),
        passwordSalt: crypto.randomBytes(16).toString('hex'),
        language: payload.language ?? 'fr',
        timezone: payload.timezone ?? null,
        is2faEnabled: false,
        twoFactorMethod: null,
        emailVerified: false,
        isActive: true,
        isLocked: false,
        lockedUntil: null,
        lastLoginAt: null,
        lastLoginIp: null,
        loginCount: 0,
        externalId,
        metadata: { department: payload.department ?? null },
        createdBy: currentUserId,
        updatedBy: currentUserId,
      });

      const persisted = await usersRepo.save(user);

      const userRole = userRolesRepo.create({
        userId: persisted.id,
        roleId: role.id,
        assignedBy: currentUserId,
        expiresAt: null,
      });
      await userRolesRepo.save(userRole);

      return persisted;
    });

    // 3) L'email d'invitation est envoyé par le frontend via le SDK Firebase
    //    client (sendPasswordResetEmail) après la réponse de cette route.
    //    Voir App.tsx:1334. Le backend n'orchestre plus l'envoi pour éviter
    //    le double appel et la dépendance SMTP custom.
    this.logger.log(`User Firebase + DB créé (id=${savedUser.id}). Envoi email géré côté frontend.`);

    return savedUser;
  }

  async updateForTenant(
    organizationId: string,
    id: string,
    updatedBy: string | null,
    input: UpdateUserInput,
  ): Promise<User | null> {
    const patch: Partial<User> = {};

    if (typeof input.firstName === 'string') {
      patch.firstName = input.firstName;
    }
    if (typeof input.lastName === 'string') {
      patch.lastName = input.lastName;
    }
    if (input.phone !== undefined) {
      patch.phone = input.phone;
    }
    if (input.gender !== undefined) {
      patch.gender = input.gender;
    }
    if (input.birthDate !== undefined) {
      patch.birthDate = input.birthDate ? new Date(input.birthDate) : null;
    }
    if (input.language !== undefined) {
      patch.language = input.language ?? 'fr';
    }
    if (input.timezone !== undefined) {
      patch.timezone = input.timezone;
    }
    if (input.department !== undefined) {
      // Récupérer le metadata existant en DB et merger
      const existing = await this.usersRepo.findOne({ where: { id, organizationId } });
      const existingMetadata = (existing?.metadata as Record<string, any>) ?? {};
      patch.metadata = { ...existingMetadata, department: input.department } as any;
    }
    if (typeof input.isActive === 'boolean') {
      patch.isActive = input.isActive;
      patch.deletedAt = input.isActive ? null : new Date();
    }

    if (updatedBy) {
      patch.updatedBy = updatedBy;
    }

    if (Object.keys(patch).length === 0) {
      return this.usersRepo.findOne({ where: { id, organizationId } });
    }

    await this.usersRepo.update({ id, organizationId }, patch as any);

    return this.usersRepo.findOne({ where: { id, organizationId } });
  }

  /**
   * Profil "me" : user + rôle actif + employé (work times). Une seule requête SQL.
   * Utilisé par GET /core/users/me/profile pour l'initialisation du frontend.
   */
  async findOwnProfile(
    organizationId: string,
    userId: string,
  ): Promise<{
    user: {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      birthDate: string | null;
      employeeId: string | null;
      workStartTime: string | null;
      workEndTime: string | null;
    };
    role: { id: string; name: string; code: string } | null;
  } | null> {
    const rows: Array<{
      id: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      birth_date: string | null;
      employee_id: string | null;
      work_start_time: string | null;
      work_end_time: string | null;
      role_id: string | null;
      role_name: string | null;
      role_code: string | null;
    }> = await this.dataSource.query(
      `
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        TO_CHAR(u.birth_date, 'YYYY-MM-DD') AS birth_date,
        e.id AS employee_id,
        e.work_start_time,
        e.work_end_time,
        r.id AS role_id,
        r.name AS role_name,
        r.code AS role_code
      FROM core.users u
      LEFT JOIN module_c_rh.employees e ON e.user_id = u.id
      LEFT JOIN core.user_roles ur
        ON ur.user_id = u.id
       AND ur.is_active = true
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      LEFT JOIN core.roles r ON r.id = ur.role_id AND r.is_active = true
      WHERE u.id = $1 AND u.organization_id = $2
      ORDER BY ur.assigned_at DESC NULLS LAST
      LIMIT 1
      `,
      [userId, organizationId],
    );

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      user: {
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        birthDate: row.birth_date,
        employeeId: row.employee_id,
        workStartTime: row.work_start_time,
        workEndTime: row.work_end_time,
      },
      role: row.role_id
        ? { id: row.role_id, name: row.role_name ?? '', code: row.role_code ?? '' }
        : null,
    };
  }

  async getActiveRoleForUser(
    organizationId: string,
    userId: string,
  ): Promise<{ roleId: string; roleName: string; roleCode: string } | null> {
    const user = await this.usersRepo.findOne({ where: { id: userId, organizationId } });
    if (!user) {
      return null;
    }

    const active = await this.userRolesRepo.find({
      where: { userId, isActive: true },
      relations: ['role'],
      order: { assignedAt: 'DESC' },
    });

    const role = active[0]?.role;
    if (!role) {
      return null;
    }

    return { roleId: role.id, roleName: role.name, roleCode: role.code };
  }

  async changeRoleForUser(
    organizationId: string,
    assignedBy: string | null,
    userId: string,
    roleId: string,
  ): Promise<{ changed: true; userId: string; roleId: string }> {
    const user = await this.usersRepo.findOne({ where: { id: userId, organizationId } });
    if (!user) {
      throw new BadRequestException('Utilisateur introuvable');
    }

    const role = await this.rolesRepo.findOne({ where: { id: roleId } });
    if (!role) {
      throw new BadRequestException('Rôle invalide');
    }

    await this.usersRepo.manager.transaction(async (manager) => {
      const userRolesRepo = manager.getRepository(UserRole);

      // Désactiver les rôles actifs existants (sauf le rôle cible)
      await userRolesRepo.update(
        { userId, isActive: true } as any,
        { isActive: false } as any,
      );

      const existing = await userRolesRepo.findOne({ where: { userId, roleId: role.id } as any });

      if (existing) {
        await userRolesRepo.update(
          { id: existing.id } as any,
          {
            assignedBy,
            expiresAt: null,
            isActive: true,
          } as any,
        );
        return;
      }

      const userRole = userRolesRepo.create({
        userId,
        roleId: role.id,
        assignedBy,
        expiresAt: null,
        isActive: true,
      });
      await userRolesRepo.save(userRole);
    });

    return { changed: true, userId, roleId: role.id };
  }

  async softDeleteForTenant(
    organizationId: string,
    id: string,
    updatedBy: string | null,
  ): Promise<void> {
    const patch: Partial<User> = {
      isActive: false,
      deletedAt: new Date(),
    };
    if (updatedBy) {
      patch.updatedBy = updatedBy;
    }
    await this.usersRepo.update({ id, organizationId }, patch as any);
  }

  async restoreForTenant(
    organizationId: string,
    id: string,
    updatedBy: string | null,
  ): Promise<void> {
    const patch: Partial<User> = {
      isActive: true,
      deletedAt: null,
    };
    if (updatedBy) {
      patch.updatedBy = updatedBy;
    }
    await this.usersRepo.update({ id, organizationId }, patch as any);
  }

  async hardDeleteForTenant(organizationId: string, id: string): Promise<void> {
    await this.usersRepo.delete({ id, organizationId });
  }

  async bulkActionForTenant(
    organizationId: string,
    updatedBy: string | null,
    action: 'soft-delete' | 'restore' | 'activate' | 'deactivate',
    ids: string[],
  ): Promise<{ affected: number }> {
    if (!ids || ids.length === 0) {
      return { affected: 0 };
    }

    const where = { id: In(ids), organizationId } as any;

    let patch: Partial<User>;
    switch (action) {
      case 'soft-delete':
        patch = { isActive: false, deletedAt: new Date() };
        break;
      case 'restore':
      case 'activate':
        patch = { isActive: true, deletedAt: null };
        break;
      case 'deactivate':
        patch = { isActive: false };
        break;
      default:
        throw new Error('Unsupported bulk action');
    }

    if (updatedBy) {
      patch.updatedBy = updatedBy;
    }

    const result = await this.usersRepo.update(where, patch as any);
    return { affected: result.affected ?? 0 };
  }

  async getLoginHistoryForUser(
    organizationId: string,
    userId: string,
    limit: number = 20,
  ): Promise<{ data: LoginHistory[]; meta: { total: number } }> {
    // Verifier que l'utilisateur appartient a l'organisation
    const user = await this.usersRepo.findOne({
      where: { id: userId, organizationId },
    });

    if (!user) {
      throw new BadRequestException('Utilisateur introuvable');
    }

    const history = await this.loginHistoryRepo.find({
      where: { userId },
      order: { loginAt: 'DESC' },
      take: limit,
    });

    const total = await this.loginHistoryRepo.count({
      where: { userId },
    });

    return {
      data: history,
      meta: { total },
    };
  }
}
