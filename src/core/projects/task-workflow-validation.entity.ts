import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Task } from './task.entity';
import { ProjectWorkflowStep } from './project-workflow-step.entity';
import { User } from '../users/user.entity';

export type ValidationDecision = 'approved' | 'rejected' | 'pending';

@Entity({ schema: 'module_b_projects', name: 'task_workflow_validations' })
@Index(['taskId', 'stepId'])
@Index(['organizationId', 'validatorId'])
export class TaskWorkflowValidation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'task_id' })
  taskId!: string;

  @ManyToOne(() => Task, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task!: Task;

  @Column({ type: 'uuid', name: 'step_id' })
  stepId!: string;

  @ManyToOne(() => ProjectWorkflowStep, { nullable: false })
  @JoinColumn({ name: 'step_id' })
  step!: ProjectWorkflowStep;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'uuid', name: 'validator_id' })
  validatorId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'validator_id' })
  validator!: User;

  @Column({
    type: 'enum',
    enum: ['approved', 'rejected', 'pending'],
    default: 'pending',
  })
  decision!: ValidationDecision;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ type: 'text', name: 'rejected_reason', nullable: true })
  rejectedReason!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamp', name: 'validated_at', nullable: true })
  validatedAt!: Date | null;
}
