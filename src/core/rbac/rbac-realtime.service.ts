import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from './user-role.entity';

/**
 * Diffusion temps reel des changements de droits.
 *
 * Les permissions sont mises en cache cote client (5 min) et cote guard.
 * Sans signal, un utilisateur conservait donc ses ANCIENS droits jusqu'au
 * prochain rechargement : au mieux une incoherence d'affichage, au pire un
 * acces retire qui reste visible.
 *
 * On reutilise la room `user:<id>:notifications` de la gateway /rt, deja
 * rejointe en permanence par le client (useNotificationsSocket), plutot que
 * d'ouvrir un second canal.
 */
@Injectable()
export class RbacRealtimeService implements OnModuleInit {
  private readonly logger = new Logger(RbacRealtimeService.name);
  private gateway: any;

  constructor(
    private readonly moduleRef: ModuleRef,
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
  ) {}

  async onModuleInit() {
    try {
      const { TaskCommentsGateway } = await import(
        '../projects/task-comments.gateway.js'
      );
      this.gateway = this.moduleRef.get(TaskCommentsGateway, { strict: false });
    } catch (e) {
      this.logger.error(
        `Gateway temps reel indisponible : ${(e as Error).message}`,
      );
    }
  }

  /**
   * Un utilisateur a gagne ou perdu un role.
   * Evenement deja emis par rbac-management pour invalider le cache du guard ;
   * on se contente de le relayer au client concerne.
   */
  @OnEvent('rbac.permissions.changed')
  onUserPermissionsChanged(payload: { userId: string }): void {
    if (payload?.userId) this.notifyUser(String(payload.userId), 'role');
  }

  /**
   * Les permissions d'un ROLE ont change : tous ses porteurs sont affectes,
   * sans avoir rien fait eux-memes.
   */
  @OnEvent('rbac.role.changed')
  onRoleChanged(payload: { roleId: string }): void {
    if (payload?.roleId) void this.notifyRoleHolders(String(payload.roleId), 'role-permissions');
  }

  /** Previent UN utilisateur que ses droits ont change. */
  notifyUser(userId: string, reason: string): void {
    if (!this.gateway || !userId) return;
    try {
      this.gateway.emitNotificationToUser({
        userId,
        event: 'rbac.permissions.changed',
        payload: { reason, at: new Date().toISOString() },
      });
    } catch (err) {
      this.logger.warn(
        `notifyUser(${reason}) a echoue : ${(err as Error).message}`,
      );
    }
  }

  /**
   * Previent TOUS les porteurs d'un role. Utilise quand ce sont les
   * permissions du role qui changent : l'utilisateur n'a rien fait, mais ses
   * droits effectifs ne sont plus les memes.
   */
  async notifyRoleHolders(roleId: string, reason: string): Promise<void> {
    if (!this.gateway || !roleId) return;
    try {
      const holders = await this.userRolesRepo.find({
        where: { roleId, isActive: true },
        select: { userId: true } as any,
      });
      for (const h of holders) {
        if (h.userId) this.notifyUser(String(h.userId), reason);
      }
    } catch (err) {
      this.logger.warn(
        `notifyRoleHolders(${reason}) a echoue : ${(err as Error).message}`,
      );
    }
  }
}
