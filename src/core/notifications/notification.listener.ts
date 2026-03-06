import { Injectable, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InAppNotificationService } from './in-app-notification.service';
import { FcmService } from './fcm.service';

export interface TaskAssignedEvent {
  taskId: string;
  projectId: string;
  assigneeId: string;
  oldAssigneeId?: string;
  projectName: string;
  taskTitle: string;
  organizationId: string;
  triggeredBy: string;
}

export interface TaskUnassignedEvent {
  taskId: string;
  projectId: string;
  oldAssigneeId: string;
  projectName: string;
  taskTitle: string;
  organizationId: string;
  triggeredBy: string;
}

@Injectable()
export class NotificationListener {
  constructor(
    private readonly inAppNotificationService: InAppNotificationService,
    private readonly fcmService: FcmService,
  ) {}

  @OnEvent('task.assigned')
  async handleTaskAssigned(event: TaskAssignedEvent) {
    console.log('[NotificationListener] task.assigned event received:', event);

    // Ne pas notifier si l'utilisateur s'assigne à lui-même
    if (event.assigneeId === event.triggeredBy) {
      console.log('[NotificationListener] Skipping notification - user assigned to themselves');
      return;
    }

    try {
      // Notification in-app
      await this.inAppNotificationService.createMany([
        {
          userId: event.assigneeId,
          organizationId: event.organizationId,
          type: 'task_assigned',
          title: 'Nouvelle tâche assignée',
          message: `Vous avez été assigné(e) à la tâche "${event.taskTitle}" dans le projet "${event.projectName}"`,
          data: {
            taskId: event.taskId,
            projectId: event.projectId,
            projectName: event.projectName,
            taskTitle: event.taskTitle,
          },
        },
      ]);

      // Notification push FCM
      await this.fcmService.sendToUser(
        event.assigneeId,
        'Nouvelle tâche assignée',
        `Vous avez été assigné(e) à "${event.taskTitle}"`,
        {
          type: 'task_assigned',
          taskId: event.taskId,
          projectId: event.projectId,
        },
      );
    } catch (err) {
      console.error('[NotificationListener] Failed to send task.assigned notification:', err);
      // Ne pas propager l'erreur - la logique métier ne doit pas échouer
    }
  }

  @OnEvent('task.unassigned')
  async handleTaskUnassigned(event: TaskUnassignedEvent) {
    console.log('[NotificationListener] task.unassigned event received:', event);

    // Ne pas notifier si l'utilisateur se désassigne lui-même
    if (event.oldAssigneeId === event.triggeredBy) {
      console.log('[NotificationListener] Skipping notification - user unassigned themselves');
      return;
    }

    try {
      await this.inAppNotificationService.createMany([
        {
          userId: event.oldAssigneeId,
          organizationId: event.organizationId,
          type: 'task_unassigned',
          title: 'Tâche désassignée',
          message: `Vous avez été désassigné(e) de la tâche "${event.taskTitle}" dans le projet "${event.projectName}"`,
          data: {
            taskId: event.taskId,
            projectId: event.projectId,
            projectName: event.projectName,
            taskTitle: event.taskTitle,
          },
        },
      ]);
    } catch (err) {
      console.error('[NotificationListener] Failed to send task.unassigned notification:', err);
      // Ne pas propager l'erreur
    }
  }
}
