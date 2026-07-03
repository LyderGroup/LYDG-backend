import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from './project.entity';

@Entity({ schema: 'module_b_projects', name: 'project_workflows' })
export class ProjectWorkflow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'boolean', name: 'is_default', default: true })
  isDefault!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  // ─── Soft-delete (Sprint B) ───────────────────────────────────────
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @Column({ type: 'uuid', name: 'deleted_by', nullable: true })
  deletedBy!: string | null;

  @Column({ type: 'text', name: 'deletion_reason', nullable: true })
  deletionReason!: string | null;
}
