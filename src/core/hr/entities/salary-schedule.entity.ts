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
import { Organization } from '../../organizations/organizations.entity';
import { User } from '../../users/user.entity';

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
export type SalaryFrequency = 'monthly' | 'bi_weekly' | 'weekly' | 'custom';
export type PaymentStatus = 'scheduled' | 'processing' | 'paid' | 'failed' | 'cancelled';

@Entity({ schema: 'module_c_rh', name: 'salary_schedules' })
export class SalarySchedule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'int', name: 'pay_day' })
  payDay!: number; // 1-31

  @Column({ type: 'date', name: 'effective_from', default: () => 'CURRENT_DATE' })
  effectiveFrom!: Date;

  @Column({ type: 'date', name: 'effective_to', nullable: true })
  effectiveTo!: Date | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'monthly',
  })
  frequency!: SalaryFrequency;

  @Column({ type: 'int', name: 'custom_interval', nullable: true })
  customInterval!: number | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}

@Entity({ schema: 'module_c_rh', name: 'salary_payments' })
export class SalaryPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'schedule_id', nullable: true })
  scheduleId!: string | null;

  @ManyToOne(() => SalarySchedule, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'schedule_id' })
  schedule?: SalarySchedule | null;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'date', name: 'scheduled_date' })
  scheduledDate!: Date;

  @Column({ type: 'date', name: 'paid_date', nullable: true })
  paidDate!: Date | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 15, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'XOF' })
  currency!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'scheduled',
  })
  status!: PaymentStatus;

  @Column({ type: 'varchar', length: 100, name: 'transaction_ref', nullable: true })
  transactionRef!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', name: 'processed_by', nullable: true })
  processedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'processed_by' })
  processor?: User | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
