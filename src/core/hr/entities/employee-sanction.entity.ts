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
import { Employee } from '../employee.entity';
import { User } from '../../users/user.entity';
import { ElectronicSignature } from './electronic-signature.entity';

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
export type WarningType = 'VERBAL' | 'WRITTEN' | 'FINAL';
export type SanctionStatus = 'active' | 'served' | 'cancelled' | 'appealed';

@Entity({ schema: 'module_c_rh', name: 'employee_sanctions' })
export class EmployeeSanction {
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

  @Column({ type: 'uuid', name: 'sanction_type_id' })
  sanctionTypeId!: string;

  // Détails
  @Column({ type: 'int' })
  level!: number;

  @Column({ type: 'varchar', length: 50 })
  type!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // Faute
  @Column({ type: 'date', name: 'fault_date', nullable: true })
  faultDate!: Date | null;

  @Column({ type: 'text', name: 'fault_details', nullable: true })
  faultDetails!: string | null;

  // Conséquences
  @Column({
    type: 'decimal',
    transformer: numericTransformer,
    precision: 5,
    scale: 2,
    name: 'bonus_retention_percent',
    default: 0,
  })
  bonusRetentionPercent!: number;

  @Column({ type: 'date', name: 'suspension_start_date', nullable: true })
  suspensionStartDate!: Date | null;

  @Column({ type: 'date', name: 'suspension_end_date', nullable: true })
  suspensionEndDate!: Date | null;

  @Column({ type: 'int', name: 'suspension_days', default: 0 })
  suspensionDays!: number;

  // Avertissement
  @Column({
    type: 'varchar',
    length: 20,
    name: 'warning_type',
    nullable: true,
  })
  warningType!: WarningType | null;

  // Validation
  @Column({ type: 'uuid', name: 'sanctioned_by', nullable: true })
  sanctionedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'sanctioned_by' })
  sanctioner?: User | null;

  @Column({ type: 'date', name: 'sanction_date' })
  sanctionDate!: Date;

  // Signature employé
  @Column({ type: 'uuid', name: 'employee_signature_id', nullable: true })
  employeeSignatureId!: string | null;

  @ManyToOne(() => ElectronicSignature, { nullable: true })
  @JoinColumn({ name: 'employee_signature_id' })
  employeeSignature?: ElectronicSignature | null;

  @Column({ type: 'timestamp', name: 'employee_signed_at', nullable: true })
  employeeSignedAt!: Date | null;

  @Column({ type: 'boolean', name: 'employee_refused', default: false })
  employeeRefused!: boolean;

  @Column({ type: 'text', name: 'refusal_reason', nullable: true })
  refusalReason!: string | null;

  // Statut
  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
  })
  status!: SanctionStatus;

  // Appel
  @Column({ type: 'timestamp', name: 'appeal_date', nullable: true })
  appealDate!: Date | null;

  @Column({ type: 'text', name: 'appeal_reason', nullable: true })
  appealReason!: string | null;

  @Column({ type: 'text', name: 'appeal_resolution', nullable: true })
  appealResolution!: string | null;

  @Column({ type: 'timestamp', name: 'appeal_resolved_at', nullable: true })
  appealResolvedAt!: Date | null;

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
