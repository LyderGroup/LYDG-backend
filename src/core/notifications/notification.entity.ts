import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type NotificationType =
  | 'validation_request'
  | 'validation_approved'
  | 'validation_rejected'
  | 'task_assigned'
  | 'task_unassigned'
  | 'task_completed'
  | 'task_comment'
  | 'project_created'
  | 'project_comment'
  | 'project_status_changed'
  | 'mention'
  | 'deadline_reminder'
  // RH
  | 'leave_deduction_applied'
  | 'leave_deduction_cancelled'
  | 'leave_balance_negative'
  | 'attendance_late_reminder'
  | 'attendance_checkout_reminder'
  | 'attendance_incomplete_yesterday'
  // Heures supplémentaires
  | 'overtime_detected'
  | 'payday_overtime_summary'
  // Discipline
  | 'sanction_applied'
  | 'sanction_threshold_approaching'
  | 'sanction_admin_alert'
  // Vie interne / Events
  | 'event_published'
  | 'event_invitation'
  // Journal de bord
  | 'journal_feedback'
  // Diagnostic
  | 'test_push';

@Entity({ schema: 'core', name: 'notifications' })
@Index(['userId', 'isRead'])
@Index(['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  // Colonne `type` NOT NULL côté DB (legacy). On la matérialise pour que
  // TypeORM l'inclue dans l'INSERT — sinon violation NOT NULL.
  // `data.notificationType` est conservé pour rétro-compat avec l'UI.
  @Column({ type: 'varchar', length: 50 })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: false })
  message!: string;

  @Column({ type: 'jsonb', nullable: true })
  data!: Record<string, any> | null;

  @Column({ type: 'boolean', name: 'is_read', default: false })
  isRead!: boolean;

  @Column({ type: 'timestamp', name: 'read_at', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
