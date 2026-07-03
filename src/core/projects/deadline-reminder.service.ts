import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, DataSource } from 'typeorm';
import { Project } from './project.entity';
import { Task } from './task.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { FcmService } from '../notifications/fcm.service';

@Injectable()
export class DeadlineReminderService {
  private readonly logger = new Logger(DeadlineReminderService.name);
  private isProcessing = false;

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    private readonly notificationService: InAppNotificationService,
    private readonly fcmService: FcmService,
    private readonly dataSource: DataSource,
  ) { }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleDailyDeadlineReminders() {
    // Prevent concurrent execution in the same instance
    if (this.isProcessing) {
      this.logger.warn('Deadline reminders already processing, skipping...');
      return;
    }

    // Distributed lock via database advisory lock (PostgreSQL)
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Try to acquire an advisory lock (session-level, auto-released on disconnect)
      // Lock ID is a hash of 'deadline_reminders_daily'
      const lockResult = await queryRunner.query(
        `SELECT pg_try_advisory_lock(1234567890) AS acquired`,
      );

      if (!lockResult?.[0]?.acquired) {
        this.logger.log('Another instance is already processing deadline reminders, skipping...');
        return;
      }

      this.isProcessing = true;
      this.logger.log('Starting daily deadline reminder check...');

      await this.sendProjectDeadlineReminders();
      await this.sendTaskDeadlineReminders();
      this.logger.log('Daily deadline reminders completed');
    } catch (error) {
      this.logger.error('Error sending deadline reminders:', error);
    } finally {
      this.isProcessing = false;
      // Release the advisory lock
      await queryRunner.query(`SELECT pg_advisory_unlock(1234567890)`).catch(() => { });
      await queryRunner.release();
    }
  }

  private async sendProjectDeadlineReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const in1DayEnd = new Date(today);
    in1DayEnd.setDate(in1DayEnd.getDate() + 1);
    in1DayEnd.setHours(23, 59, 59, 999);

    const in3DaysStart = new Date(today);
    in3DaysStart.setDate(in3DaysStart.getDate() + 3);

    const in3DaysEnd = new Date(today);
    in3DaysEnd.setDate(in3DaysEnd.getDate() + 3);
    in3DaysEnd.setHours(23, 59, 59, 999);

    // Use QueryBuilder with BETWEEN to catch deadlines that might have been missed if cron skipped a day
    const [projects3Days, projects1Day] = await Promise.all([
      this.projectRepo
        .createQueryBuilder('p')
        .where('p.planned_end_date BETWEEN :start AND :end', { start: in3DaysStart, end: in3DaysEnd })
        .andWhere('p.status = :status', { status: 'in_progress' })
        .andWhere('p.actual_end_date IS NULL')
        .getMany(),
      this.projectRepo
        .createQueryBuilder('p')
        .where('p.planned_end_date BETWEEN :start AND :end', { start: tomorrow, end: in1DayEnd })
        .andWhere('p.status = :status', { status: 'in_progress' })
        .andWhere('p.actual_end_date IS NULL')
        .getMany(),
    ]);

    // Batch notifications in parallel (chunks of 10)
    const batchSize = 10;
    const allProjects = [...projects3Days.map(p => ({ project: p, days: 3 })), ...projects1Day.map(p => ({ project: p, days: 1 }))];

    for (let i = 0; i < allProjects.length; i += batchSize) {
      const batch = allProjects.slice(i, i + batchSize);
      await Promise.all(batch.map(({ project, days }) => this.sendProjectReminder(project, days)));
    }

    this.logger.log(`Sent reminders: ${projects3Days.length} projects (J-3), ${projects1Day.length} projects (J-1)`);
  }

  private async sendTaskDeadlineReminders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const in1DayEnd = new Date(today);
    in1DayEnd.setDate(in1DayEnd.getDate() + 1);
    in1DayEnd.setHours(23, 59, 59, 999);

    const in3DaysStart = new Date(today);
    in3DaysStart.setDate(in3DaysStart.getDate() + 3);

    const in3DaysEnd = new Date(today);
    in3DaysEnd.setDate(in3DaysEnd.getDate() + 3);
    in3DaysEnd.setHours(23, 59, 59, 999);

    // Use QueryBuilder with BETWEEN to catch deadlines that might have been missed if cron skipped a day
    const [tasks3Days, tasks1Day] = await Promise.all([
      this.taskRepo
        .createQueryBuilder('t')
        .where('t.due_date BETWEEN :start AND :end', { start: in3DaysStart, end: in3DaysEnd })
        .andWhere('t.status = :status', { status: 'in_progress' })
        .getMany(),
      this.taskRepo
        .createQueryBuilder('t')
        .where('t.due_date BETWEEN :start AND :end', { start: tomorrow, end: in1DayEnd })
        .andWhere('t.status = :status', { status: 'in_progress' })
        .getMany(),
    ]);

    // Batch notifications in parallel (chunks of 10)
    const batchSize = 10;
    const allTasks = [...tasks3Days.map(t => ({ task: t, days: 3 })), ...tasks1Day.map(t => ({ task: t, days: 1 }))];

    for (let i = 0; i < allTasks.length; i += batchSize) {
      const batch = allTasks.slice(i, i + batchSize);
      await Promise.all(batch.map(({ task, days }) => this.sendTaskReminder(task, days)));
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

    // Include project managers
    try {
      const managerRows = await this.projectRepo.manager.query(
        `
        SELECT pm.user_id
        FROM module_b_projects.project_managers pm
        WHERE pm.project_id = $1
        `,
        [task.projectId],
      ) as Array<{ user_id: string }>;

      for (const row of managerRows) {
        if (row.user_id && !recipients.includes(row.user_id)) {
          recipients.push(row.user_id);
        }
      }
    } catch {
      // Ignore if table doesn't exist
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
