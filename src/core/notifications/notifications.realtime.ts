import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class NotificationsRealtimeService implements OnModuleInit {
  private taskCommentsGateway: any;

  constructor(private readonly moduleRef: ModuleRef) { }

  async onModuleInit() {
    // Lazy load TaskCommentsGateway pour éviter la dépendance circulaire
    try {
      const { TaskCommentsGateway } = await import('../projects/task-comments.gateway.js');
      this.taskCommentsGateway = this.moduleRef.get(TaskCommentsGateway, { strict: false });
    } catch (e) {
      console.error('[NotificationsRealtimeService] Failed to load TaskCommentsGateway:', e);
    }
  }

  /**
   * Notifie un utilisateur en temps réel d'une nouvelle notification
   */
  emitNotificationCreated(input: {
    userId: string;
    notification: {
      id: string;
      type: string;
      title: string;
      message?: string | null;
      data?: Record<string, any> | null;
      createdAt: Date;
    };
  }) {
    if (this.taskCommentsGateway) {
      this.taskCommentsGateway.emitNotificationToUser({
        userId: input.userId,
        event: 'notification.created',
        payload: input.notification,
      });
    }
  }

  /**
   * Notifie un utilisateur que ses notifications ont été marquées comme lues
   */
  emitNotificationsRead(input: {
    userId: string;
    notificationIds?: string[];
    all?: boolean;
  }) {
    if (this.taskCommentsGateway) {
      this.taskCommentsGateway.emitNotificationToUser({
        userId: input.userId,
        event: 'notification.read',
        payload: {
          notificationIds: input.notificationIds,
          all: input.all,
        },
      });
    }
  }
}
