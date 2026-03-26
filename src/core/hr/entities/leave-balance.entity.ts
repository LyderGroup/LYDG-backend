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

@Entity({ schema: 'module_c_rh', name: 'leave_balances' })
export class LeaveBalance {
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

  @Column({ type: 'int' })
  year!: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 1,
    name: 'entitled_days',
    default: 0,
  })
  entitledDays!: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 1,
    name: 'accrued_days',
    default: 0,
  })
  accruedDays!: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 1,
    name: 'taken_days',
    default: 0,
  })
  takenDays!: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 1,
    name: 'carried_over_days',
    default: 0,
  })
  carriedOverDays!: number;

  @Column({ type: 'date', name: 'last_accrual_date', nullable: true })
  lastAccrualDate!: Date | null;

  @Column({ type: 'date', name: 'next_accrual_date', nullable: true })
  nextAccrualDate!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
