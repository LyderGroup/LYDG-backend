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
export type BonusCategory = 'PERFORMANCE' | 'EXCEPTIONAL' | 'RETENTION' | 'CERTIFICATION' | 'TERRAIN' | 'OTHER';
export type BonusStatus = 'pending' | 'approved' | 'paid' | 'cancelled';

@Entity({ schema: 'module_c_rh', name: 'employee_bonuses' })
export class EmployeeBonus {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'uuid', name: 'bonus_type_id' })
  bonusTypeId!: string;

  // Période
  @Column({ type: 'int', name: 'period_month' })
  periodMonth!: number;

  @Column({ type: 'int', name: 'period_year' })
  periodYear!: number;

  // Montant
  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 15, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'XOF' })
  currency!: string;

  // Calcul
  @Column({ type: 'jsonb', name: 'calculation_details', default: {} })
  calculationDetails!: Record<string, any>;

  @Column({ type: 'boolean', name: 'score_based', default: false })
  scoreBased!: boolean;

  @Column({
    type: 'decimal',
    transformer: numericTransformer,
    precision: 5,
    scale: 2,
    name: 'score_value',
    nullable: true,
  })
  scoreValue!: number | null;

  // Validation
  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  status!: BonusStatus;

  @Column({ type: 'uuid', name: 'approved_by', nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approver?: User | null;

  @Column({ type: 'timestamp', name: 'approved_at', nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'timestamp', name: 'paid_at', nullable: true })
  paidAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
