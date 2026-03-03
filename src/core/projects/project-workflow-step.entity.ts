import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProjectWorkflow } from './project-workflow.entity';

@Entity({ schema: 'module_b_projects', name: 'project_workflow_steps' })
export class ProjectWorkflowStep {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workflow_id' })
  workflowId!: string;

  @ManyToOne(() => ProjectWorkflow, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflow_id' })
  workflow!: ProjectWorkflow;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'int', name: 'step_order' })
  stepOrder!: number;

  @Column({ type: 'boolean', name: 'requires_validation', default: false })
  requiresValidation!: boolean;

  @Column({ type: 'varchar', length: 20, name: 'validator_role', nullable: true })
  validatorRole!: string | null;

  @Column({ type: 'boolean', name: 'is_final_step', default: false })
  isFinalStep!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
