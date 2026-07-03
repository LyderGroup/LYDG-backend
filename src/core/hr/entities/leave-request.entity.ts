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
import { LeaveType } from './leave-type.entity';
import { User } from '../../users/user.entity';

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
export type LeaveRequestStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'taken'
  | 'expired';

export type DayPeriod = 'morning' | 'afternoon' | 'full_day';

@Entity({ schema: 'module_c_rh', name: 'leave_requests' })
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'uuid', name: 'leave_type_id' })
  leaveTypeId!: string;

  @ManyToOne(() => LeaveType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leave_type_id' })
  leaveType!: LeaveType;

  @Column({ type: 'date', name: 'start_date' })
  startDate!: Date;

  @Column({ type: 'date', name: 'end_date' })
  endDate!: Date;

  @Column({
    type: 'varchar',
    length: 10,
    name: 'start_period',
    default: 'full_day',
  })
  startPeriod!: DayPeriod;

  @Column({
    type: 'varchar',
    length: 10,
    name: 'end_period',
    default: 'full_day',
  })
  endPeriod!: DayPeriod;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 4, scale: 1, name: 'total_days' })
  totalDays!: number;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 4, scale: 1, name: 'weekends_count', default: 0 })
  weekendsCount!: number;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 4, scale: 1, name: 'holidays_count', default: 0 })
  holidaysCount!: number;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'text', nullable: true })
  destination!: string | null;

  @Column({ type: 'text', name: 'emergency_contact', nullable: true })
  emergencyContact!: string | null;

  @Column({ type: 'uuid', name: 'workflow_instance_id', nullable: true })
  workflowInstanceId!: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'pending',
  })
  status!: LeaveRequestStatus;

  @Column({ type: 'uuid', name: 'approved_by', nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approver?: User | null;

  @Column({ type: 'timestamp', name: 'approval_date', nullable: true })
  approvalDate!: Date | null;

  @Column({ type: 'text', name: 'rejection_reason', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'uuid', name: 'substitute_employee_id', nullable: true })
  substituteEmployeeId!: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'substitute_employee_id' })
  substituteEmployee?: Employee | null;

  @Column({ type: 'text', name: 'handover_notes', nullable: true })
  handoverNotes!: string | null;

  @Column({ type: 'jsonb', default: [] })
  attachments!: any[];

  @Column({ type: 'boolean', name: 'is_joker', default: false })
  isJoker!: boolean;

  @Column({ type: 'boolean', name: 'is_partial', default: false })
  isPartial!: boolean;

  @Column({ type: 'time', name: 'start_time', nullable: true })
  startTime!: string | null;

  @Column({ type: 'time', name: 'end_time', nullable: true })
  endTime!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
