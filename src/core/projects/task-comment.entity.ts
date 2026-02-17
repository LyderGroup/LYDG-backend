import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Task } from './task.entity';

@Entity({ schema: 'module_b_projects', name: 'task_comments' })
export class TaskComment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'task_id' })
  taskId!: string;

  @ManyToOne(() => Task, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task!: Task;

  @Column({ type: 'uuid', name: 'parent_comment_id', nullable: true })
  parentCommentId!: string | null;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ type: 'text', name: 'content' })
  content!: string;

  @Column({ type: 'varchar', length: 50, name: 'content_type', default: 'text' })
  contentType!: string;

  @Column({ type: 'boolean', name: 'is_internal', default: true })
  isInternal!: boolean;

  @Column({ type: 'varchar', length: 20, name: 'visibility', default: 'public' })
  visibility!: string;

  @Column({ type: 'jsonb', name: 'mentions', default: () => "'[]'" })
  mentions!: any;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
