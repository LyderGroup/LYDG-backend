import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';

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
  ) {}
 
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepo.create({
      userId: dto.userId,
      organizationId: dto.organizationId,
      type: dto.type,
      title: dto.title,
      message: dto.message ?? null,
      data: dto.data ?? null,
      isRead: false,
    });

    return this.notificationRepo.save(notification);
  }
 
  async createMany(dtos: CreateNotificationDto[]): Promise<Notification[]> {
    const notifications = dtos.map(dto => 
      this.notificationRepo.create({
        userId: dto.userId,
        organizationId: dto.organizationId,
        type: dto.type,
        title: dto.title,
        message: dto.message ?? null,
        data: dto.data ?? null,
        isRead: false,
      })
    );

    return this.notificationRepo.save(notifications);
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
