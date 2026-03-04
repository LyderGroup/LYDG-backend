import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, IsNull } from 'typeorm';
import { Project } from './project.entity';
import { Task } from './task.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { FcmService } from '../notifications/fcm.service';

@Injectable()
export class DeadlineReminderService {
  private readonly logger = new Logger(DeadlineReminderService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    private readonly notificationService: InAppNotificationService,
    private readonly fcmService: FcmService,
  ) {}
 
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleDailyDeadlineReminders() {
    this.logger.log('Starting daily deadline reminder check...');
    
    try {
      await this.sendProjectDeadlineReminders();
      await this.sendTaskDeadlineReminders();
      this.logger.log('Daily deadline reminders completed');
    } catch (error) {
      this.logger.error('Error sending deadline reminders:', error);
    }
  }
 
  private async sendProjectDeadlineReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);

    const in1Day = new Date(today);
    in1Day.setDate(in1Day.getDate() + 1);
 
    const projects3Days = await this.projectRepo.find({
      where: {
        plannedEndDate: this.formatDate(in3Days),
        status: 'in_progress',
        actualEndDate: IsNull(),
      },
    });
 
    const projects1Day = await this.projectRepo.find({
      where: {
        plannedEndDate: this.formatDate(in1Day),
        status: 'in_progress',
        actualEndDate: IsNull(),
      },
    });
 
    for (const project of projects3Days) {
      await this.sendProjectReminder(project, 3);
    }
 
    for (const project of projects1Day) {
      await this.sendProjectReminder(project, 1);
    }

    this.logger.log(`Sent reminders: ${projects3Days.length} projects (J-3), ${projects1Day.length} projects (J-1)`);
  }
 
  private async sendTaskDeadlineReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);

    const in1Day = new Date(today);
    in1Day.setDate(in1Day.getDate() + 1);
 
    const tasks3Days = await this.taskRepo.find({
      where: {
        dueDate: this.formatDate(in3Days),
        status: 'in_progress',
      },
    });
 
    const tasks1Day = await this.taskRepo.find({
      where: {
        dueDate: this.formatDate(in1Day),
        status: 'in_progress',
      },
    });
 
    for (const task of tasks3Days) {
      await this.sendTaskReminder(task, 3);
    }
 
    for (const task of tasks1Day) {
      await this.sendTaskReminder(task, 1);
    }

    this.logger.log(`Sent reminders: ${tasks3Days.length} tasks (J-3), ${tasks1Day.length} tasks (J-1)`);
  }
 
  private async sendProjectReminder(project: Project, daysRemaining: number) {
    const recipients: string[] = [];
 
    if (project.createdBy) {
      recipients.push(project.createdBy);
    }
 
    if (project.managerId && !recipients.includes(project.managerId)) {
      recipients.push(project.managerId);
    }

    if (recipients.length === 0) return;

    const title = `⏰ Rappel: Projet "${project.name}" - J-${daysRemaining}`;
    const message = daysRemaining === 1
      ? `Le projet "${project.name}" arrive à échéance demain !`
      : `Le projet "${project.name}" arrive à échéance dans ${daysRemaining} jours.`;
 
    await this.notificationService.createMany(
      recipients.map(userId => ({
        userId,
        organizationId: project.organizationId,
        type: 'deadline_reminder' as any,
        title,
        message,
        data: {
          projectId: project.id,
          daysRemaining,
          plannedEndDate: project.plannedEndDate,
        },
      }))
    );
 
    try {
      await this.fcmService.sendToUsers(recipients, title, message, {
        type: 'deadline_reminder',
        projectId: project.id,
        daysRemaining: String(daysRemaining),
      });
    } catch (error) {
      this.logger.error(`FCM error for project ${project.id}:`, error);
    }
  }
 
  private async sendTaskReminder(task: Task, daysRemaining: number) {
    const recipients: string[] = [];
 
    if (task.assigneeId) {
      recipients.push(task.assigneeId);
    }
    if (task.createdBy && !recipients.includes(task.createdBy)) {
      recipients.push(task.createdBy);
    }

    if (recipients.length === 0) return;

    const title = `Rappel: Tâche "${task.title}" - J-${daysRemaining}`;
    const message = daysRemaining === 1
      ? `La tâche "${task.title}" arrive à échéance demain !`
      : `La tâche "${task.title}" arrive à échéance dans ${daysRemaining} jours.`;
 
    await this.notificationService.createMany(
      recipients.map(userId => ({
        userId,
        organizationId: task.organizationId,
        type: 'deadline_reminder' as any,
        title,
        message,
        data: {
          taskId: task.id,
          projectId: task.projectId,
          daysRemaining,
          dueDate: task.dueDate,
        },
      }))
    );
 
    try {
      await this.fcmService.sendToUsers(recipients, title, message, {
        type: 'deadline_reminder',
        taskId: task.id,
        projectId: task.projectId,
        daysRemaining: String(daysRemaining),
      });
    } catch (error) {
      this.logger.error(`FCM error for task ${task.id}:`, error);
    }
  }
 
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
