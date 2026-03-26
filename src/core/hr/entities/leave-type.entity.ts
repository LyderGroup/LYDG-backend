import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/organizations.entity';

export type AccrualMethod = 'yearly' | 'monthly' | 'quarterly';

@Entity({ schema: 'module_c_rh', name: 'leave_types' })
export class LeaveType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'int', name: 'days_per_year' })
  daysPerYear!: number;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'accrual_method',
    default: 'yearly',
  })
  accrualMethod!: AccrualMethod;

  @Column({ type: 'int', name: 'max_carry_over', default: 0 })
  maxCarryOver!: number;

  @Column({ type: 'boolean', name: 'is_paid', default: true })
  isPaid!: boolean;

  @Column({ type: 'boolean', name: 'requires_approval', default: true })
  requiresApproval!: boolean;

  @Column({ type: 'uuid', name: 'approval_workflow_id', nullable: true })
  approvalWorkflowId!: string | null;

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 1,
    name: 'min_duration_days',
    default: 0.5,
  })
  minDurationDays!: number;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 1,
    name: 'max_duration_days',
    nullable: true,
  })
  maxDurationDays!: number | null;

  @Column({ type: 'int', name: 'advance_notice_days', default: 7 })
  advanceNoticeDays!: number;

  @Column({ type: 'jsonb', name: 'blackout_periods', default: [] })
  blackoutPeriods!: any[];

  @Column({ type: 'varchar', length: 7, default: '#3498db' })
  color!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  icon!: string | null;

  @Column({ type: 'int', name: 'display_order', default: 0 })
  displayOrder!: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
