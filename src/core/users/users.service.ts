import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { User } from './user.entity';
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
  language?: string | null;
  timezone?: string | null;
  department?: string | null;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  private firebaseInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
  ) {}

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
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
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

    const user = this.usersRepo.create({
      organizationId,
      email: payload.email,
      username: null,
      firstName: payload.firstName,
      lastName: payload.lastName,
      phone: payload.phone ?? null,
      // Pas de mot de passe local pour le moment, gestion via Firebase / lien d'activation
      passwordHash: '',
      passwordSalt: null,
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
      externalId: null,
      metadata: {
        department: payload.department ?? null,
      },
      createdBy: currentUserId,
      updatedBy: currentUserId,
    });

    const savedUser = await this.usersRepo.save(user);

    const userRole = this.userRolesRepo.create({
      userId: savedUser.id,
      roleId: role.id,
      assignedBy: currentUserId,
      expiresAt: null,
    });
    await this.userRolesRepo.save(userRole);

    // Invitation Firebase: créer le compte si besoin + envoyer un lien de création/réinitialisation de mot de passe.
    try {
      this.ensureFirebaseApp();

      let firebaseUser: admin.auth.UserRecord | null = null;
      try {
        firebaseUser = await admin.auth().getUserByEmail(savedUser.email);
      } catch {
        firebaseUser = null;
      }

      if (!firebaseUser) {
        firebaseUser = await admin.auth().createUser({
          email: savedUser.email,
          displayName: `${savedUser.firstName} ${savedUser.lastName}`.trim(),
          disabled: false,
        });
      }

      if (!savedUser.externalId) {
        await this.usersRepo.update(savedUser.id, { externalId: firebaseUser.uid });
        savedUser.externalId = firebaseUser.uid;
      }
    } catch (err) {
      console.error('[INVITE] Failed to generate/send reset link', err);
    }

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
    if (input.language !== undefined) {
      patch.language = input.language ?? 'fr';
    }
    if (input.timezone !== undefined) {
      patch.timezone = input.timezone;
    }
    if (input.department !== undefined) {
      // stocké dans metadata.department
      patch.metadata = { ...(patch.metadata as any), department: input.department } as any;
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

    // Désactiver les rôles actifs existants
    await this.userRolesRepo.update({ userId, isActive: true } as any, { isActive: false } as any);

    const userRole = this.userRolesRepo.create({
      userId,
      roleId: role.id,
      assignedBy,
      expiresAt: null,
      isActive: true,
    });
    await this.userRolesRepo.save(userRole);

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
}
