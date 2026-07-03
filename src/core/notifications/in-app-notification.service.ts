import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';
import { NotificationsRealtimeService } from './notifications.realtime';

export interface CreateNotificationDto {
  userId: string;
  organizationId: string;
  type: NotificationType;
  title: string;
  message?: string;
  data?: Record<string, any>;
}

@Injectable()
export class InAppNotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly realtimeService: NotificationsRealtimeService,
  ) { }

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const mergedData = { ...(dto.data ?? {}), notificationType: dto.type };
    const notification = this.notificationRepo.create({
      userId: dto.userId,
      organizationId: dto.organizationId,
      // Colonne DB legacy NOT NULL — il faut la remplir.
      type: dto.type,
      title: dto.title,
      // message NOT NULL en DB → fallback titre si vide pour ne pas violer la contrainte.
      message: dto.message ?? dto.title,
      data: mergedData,
      isRead: false,
    });

    const saved = await this.notificationRepo.save(notification);
 
    try {
      this.realtimeService.emitNotificationCreated({
        userId: saved.userId,
        notification: {
          id: saved.id,
          type: saved.type,
          title: saved.title,
          message: saved.message,
          data: saved.data,
          createdAt: saved.createdAt,
        },
      });
    } catch (e) {
      console.error('[InAppNotificationService] Realtime emit error:', e);
    }

    return saved;
  }

  async createMany(dtos: CreateNotificationDto[]): Promise<Notification[]> {
    const notifications = dtos.map(dto => {
      const mergedData = { ...(dto.data ?? {}), notificationType: dto.type };
      return this.notificationRepo.create({
        userId: dto.userId,
        organizationId: dto.organizationId,
        type: dto.type,
        title: dto.title,
        message: dto.message ?? dto.title,
        data: mergedData,
        isRead: false,
      });
    });

    const saved = await this.notificationRepo.save(notifications);

    // Émettre chaque notification en temps réel
    for (const notification of saved) {
      try {
        this.realtimeService.emitNotificationCreated({
          userId: notification.userId,
          notification: {
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data,
            createdAt: notification.createdAt,
          },
        });
      } catch (e) {
        console.error('[InAppNotificationService] Realtime emit error:', e);
      }
    }

    return saved;
  }

  /**
   * Récupère les notifications d'un utilisateur.
   */
  async getForUser(
    userId: string,
    organizationId: string,
    options?: { unreadOnly?: boolean; limit?: number },
  ): Promise<{ data: Notification[]; unreadCount: number }> {
    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .andWhere('n.organizationId = :orgId', { orgId: organizationId })
      .orderBy('n.createdAt', 'DESC');

    if (options?.unreadOnly) {
      qb.andWhere('n.isRead = false');
    }

    if (options?.limit) {
      qb.limit(options.limit);
    }

    const [data, unreadCount] = await Promise.all([
      qb.getMany(),
      this.notificationRepo.count({
        where: { userId, organizationId, isRead: false },
      }),
    ]);

    return { data, unreadCount };
  }

  /**
   * Marque une notification comme lue.
   */
  async markAsRead(
    notificationId: string,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.notificationRepo.update(
      { id: notificationId, userId, organizationId },
      { isRead: true, readAt: new Date() },
    );
  }

  /**
   * Marque toutes les notifications comme lues.
   */
  async markAllAsRead(userId: string, organizationId: string): Promise<void> {
    await this.notificationRepo.update(
      { userId, organizationId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  }

  /**
   * Supprime les anciennes notifications (plus de 30 jours).
   */
  async cleanOldNotifications(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await this.notificationRepo
      .createQueryBuilder()
      .delete()
      .where('createdAt < :date', { date: thirtyDaysAgo })
      .execute();
  }
}
