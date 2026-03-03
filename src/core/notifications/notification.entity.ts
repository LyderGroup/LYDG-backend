import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  In, 
  Repository, 
  DataSource 
} from 'typeorm';
import { User } from '../users/user.entity';

export type NotificationType = 
  | 'validation_request'
  | 'validation_approved'
  | 'validation_rejected'
  | 'task_assigned'
  | 'task_completed'
  | 'task_comment'
  | 'project_created'
  | 'project_comment'
  | 'mention'
  | 'deadline_reminder';

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

  @Column({
    type: 'varchar',
    length: 50,
    name: 'notification_type',
  })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  data!: Record<string, any> | null;

  @Column({ type: 'boolean', name: 'is_read', default: false })
  isRead!: boolean;

  @Column({ type: 'timestamp', name: 'read_at', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
