import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/organizations.entity';
import { User } from '../users/user.entity';
import { Project } from './project.entity';
import { ProjectWorkflowStep } from './project-workflow-step.entity';
import { TaskWorkflowValidation } from './task-workflow-validation.entity';

@Entity({ schema: 'module_b_projects', name: 'tasks' })
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'uuid', name: 'department_id' })
  departmentId!: string;

  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project, { nullable: false })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ type: 'uuid', name: 'parent_task_id', nullable: true })
  parentTaskId!: string | null;

  @ManyToOne(() => Task, { nullable: true })
  @JoinColumn({ name: 'parent_task_id' })
  parentTask?: Task | null;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'task_type', default: 'task' })
  taskType!: string;

  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate!: string | null;

  @Column({ type: 'date', name: 'due_date', nullable: true })
  dueDate!: string | null;

  @Column({ type: 'int', default: 0 })
  progress!: number;

  @Column({ type: 'varchar', length: 20, default: 'medium' })
  priority!: string;

  @Column({ type: 'varchar', length: 50, default: 'todo' })
  status!: string;

  @Column({ type: 'uuid', name: 'assignee_id', nullable: true })
  assigneeId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignee_id' })
  assignee?: User | null;

  @Column({ type: 'uuid', name: 'reporter_id', nullable: true })
  reporterId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reporter_id' })
  reporter?: User | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column({ type: 'uuid', name: 'workflow_id', nullable: true })
  workflowId!: string | null;

  @Column({ type: 'uuid', name: 'current_step_id', nullable: true })
  currentStepId!: string | null;

  @ManyToOne(() => ProjectWorkflowStep, { nullable: true })
  @JoinColumn({ name: 'current_step_id' })
  currentStep?: ProjectWorkflowStep | null;

  @OneToMany(() => TaskWorkflowValidation, (v) => v.task)
  validations?: TaskWorkflowValidation[];

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

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completedAt!: Date | null;
}
