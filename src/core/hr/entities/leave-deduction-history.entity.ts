import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from '../employee.entity';
import { User } from '../../users/user.entity';

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
export type DeductionRecordType = 'attendance' | 'leave_request';

export type DeductionAbsenceType =
  | 'absence'
  | 'absence_justifiee'
  | 'retard'
  | 'depart_anticipe'
  | 'conge_approuve'
  | 'maladie'
  | 'permission'
  | 'conge_paye';

/**
 * Trace immuable de chaque application/annulation de déduction.
 * Une ligne est insérée à chaque appel `applyLeaveDeduction()` (positive)
 * ou `cancelLeaveDeduction()` (négative). Permet de reconstituer le solde
 * à n'importe quel instant sans dépendre de l'état actuel des records.
 */
@Entity({ schema: 'module_c_rh', name: 'leave_deduction_histories' })
@Index('idx_leave_deduction_employee_year', ['employeeId', 'appliedAt'])
export class LeaveDeductionHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'uuid', name: 'applied_by', nullable: true })
  appliedBy!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'applied_by' })
  appliedByUser!: User | null;

  @CreateDateColumn({ type: 'timestamp', name: 'applied_at' })
  appliedAt!: Date;

  @Column({ type: 'varchar', length: 20, name: 'record_type' })
  recordType!: DeductionRecordType;

  @Column({ type: 'uuid', name: 'record_id' })
  recordId!: string;

  @Column({ type: 'varchar', length: 50, name: 'absence_type' })
  absenceType!: DeductionAbsenceType;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 6, scale: 2, default: 0 })
  hours!: string;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 6, scale: 2, name: 'days_equivalent', default: 0 })
  daysEquivalent!: string;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 6, scale: 2, name: 'previous_remaining_days' })
  previousRemainingDays!: string;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 6, scale: 2, name: 'new_remaining_days' })
  newRemainingDays!: string;

  @Column({ type: 'boolean', name: 'is_cancellation', default: false })
  isCancellation!: boolean;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;
}
