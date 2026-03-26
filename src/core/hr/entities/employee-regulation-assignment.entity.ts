import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employee.entity';
import { InternalRegulation } from './internal-regulation.entity';
import { User } from '../../users/user.entity';

export type AssignmentStatus = 'pending' | 'viewed' | 'signed' | 'refused' | 'expired';

@Entity({ schema: 'module_c_rh', name: 'employee_regulation_assignments' })
export class EmployeeRegulationAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'uuid', name: 'regulation_id' })
  regulationId!: string;

  @ManyToOne(() => InternalRegulation, (reg) => reg.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'regulation_id' })
  regulation!: InternalRegulation;

  // Dates
  @Column({ type: 'timestamp', name: 'assigned_at', default: () => 'CURRENT_TIMESTAMP' })
  assignedAt!: Date;

  @Column({ type: 'uuid', name: 'assigned_by', nullable: true })
  assignedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_by' })
  assigner?: User | null;

  @Column({ type: 'date', name: 'due_date' })
  dueDate!: Date;

  // Notifications
  @Column({ type: 'timestamp', name: 'notification_sent_at', nullable: true })
  notificationSentAt!: Date | null;

  @Column({ type: 'int', name: 'reminder_count', default: 0 })
  reminderCount!: number;

  @Column({ type: 'timestamp', name: 'last_reminder_at', nullable: true })
  lastReminderAt!: Date | null;

  // Statut
  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  status!: AssignmentStatus;

  // Accès au document
  @Column({ type: 'timestamp', name: 'first_viewed_at', nullable: true })
  firstViewedAt!: Date | null;

  @Column({ type: 'int', name: 'view_count', default: 0 })
  viewCount!: number;

  @Column({ type: 'timestamp', name: 'last_viewed_at', nullable: true })
  lastViewedAt!: Date | null;

  // Refus
  @Column({ type: 'text', name: 'refusal_reason', nullable: true })
  refusalReason!: string | null;

  @Column({ type: 'timestamp', name: 'refused_at', nullable: true })
  refusedAt!: Date | null;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
