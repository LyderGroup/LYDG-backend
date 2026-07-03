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
import { User } from '../../users/user.entity';

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'half_day'
  | 'leave'
  | 'holiday'
  | 'weekend'
  | 'business_trip';

@Entity({ schema: 'module_c_rh', name: 'attendances' })
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'date', name: 'attendance_date' })
  attendanceDate!: Date;

  @Column({ type: 'time', name: 'scheduled_start_time', nullable: true })
  scheduledStartTime!: string | null;

  @Column({ type: 'time', name: 'scheduled_end_time', nullable: true })
  scheduledEndTime!: string | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 4, scale: 2, name: 'scheduled_hours', nullable: true })
  scheduledHours!: number | null;

  @Column({ type: 'timestamp', name: 'check_in', nullable: true })
  checkIn!: Date | null;

  @Column({ type: 'timestamp', name: 'check_out', nullable: true })
  checkOut!: Date | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'present',
  })
  status!: AttendanceStatus;

  @Column({ type: 'text', name: 'late_reason', nullable: true })
  lateReason!: string | null;

  @Column({ type: 'text', name: 'absence_reason', nullable: true })
  absenceReason!: string | null;

  @Column({ type: 'boolean', default: false })
  justified!: boolean;

  @Column({ type: 'text', name: 'justification_notes', nullable: true })
  justificationNotes!: string | null;

  @Column({ type: 'uuid', name: 'approved_by', nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approver?: User | null;

  @Column({ type: 'timestamp', name: 'approved_at', nullable: true })
  approvedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
