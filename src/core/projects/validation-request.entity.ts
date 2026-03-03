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

export type ValidationRequestStatus = 'pending' | 'approved' | 'rejected';

@Entity({ schema: 'module_b_projects', name: 'validation_requests' })
@Index(['taskId', 'stepId'])
@Index(['projectId', 'status'])
export class ValidationRequest {
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

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'uuid', name: 'requester_id' })
  requesterId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'requester_id' })
  requester!: User;

  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  status!: ValidationRequestStatus;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ type: 'uuid', name: 'validated_by', nullable: true })
  validatedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'validated_by' })
  validator!: User | null;

  @Column({ type: 'text', name: 'validator_comment', nullable: true })
  validatorComment!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamp', name: 'validated_at', nullable: true })
  validatedAt!: Date | null;
}
