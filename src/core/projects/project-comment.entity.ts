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
import { Project } from './project.entity';

@Entity({ schema: 'module_b_projects', name: 'project_comments' })
export class ProjectComment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

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
