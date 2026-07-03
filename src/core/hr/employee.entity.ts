import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/organizations.entity';
import { Department } from '../departments/department.entity';
import { User } from '../users/user.entity';

import { numericTransformer } from '../../common/typeorm/numeric-transformer';
@Entity({ schema: 'module_c_rh', name: 'employees' })
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @OneToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'uuid', name: 'department_id', nullable: true })
  departmentId!: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department?: Department | null;

  @Column({ type: 'uuid', name: 'position_id', nullable: true })
  positionId!: string | null;

  @Column({ type: 'uuid', name: 'manager_id', nullable: true })
  managerId!: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'manager_id' })
  manager?: Employee | null;

  @Column({ type: 'uuid', name: 'hr_manager_id', nullable: true })
  hrManagerId!: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'hr_manager_id' })
  hrManager?: Employee | null;

  @Column({ type: 'uuid', name: 'referral_employee_id', nullable: true })
  referralEmployeeId!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'employee_number' })
  employeeNumber!: string;

  @Column({ type: 'varchar', length: 100, name: 'social_security_number', nullable: true })
  socialSecurityNumber!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'tax_id', nullable: true })
  taxId!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'job_title', nullable: true })
  jobTitle!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'employment_type', nullable: true })
  employmentType!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'contract_type', nullable: true })
  contractType!: string | null;

  @Column({ type: 'date', name: 'contract_start_date' })
  contractStartDate!: Date;

  @Column({ type: 'date', name: 'contract_end_date', nullable: true })
  contractEndDate!: Date | null;

  @Column({ type: 'date', name: 'probation_end_date', nullable: true })
  probationEndDate!: Date | null;

  @Column({ type: 'int', name: 'notice_period_days', default: 30 })
  noticePeriodDays!: number;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 15, scale: 2, name: 'base_salary', nullable: true })
  baseSalary!: number | null;

  @Column({ type: 'varchar', length: 3, name: 'salary_currency', default: 'XOF' })
  salaryCurrency!: string;

  @Column({ type: 'varchar', length: 20, name: 'payment_frequency', default: 'monthly' })
  paymentFrequency!: string;

  @Column({ type: 'varchar', length: 255, name: 'birth_place', nullable: true })
  birthPlace!: string | null;

  @Column({ type: 'date', name: 'birth_date', nullable: true })
  birthDate!: Date | null;

  @Column({ type: 'varchar', length: 50, name: 'marital_status', nullable: true })
  maritalStatus!: string | null;

  @Column({ type: 'int', name: 'dependents_count', default: 0 })
  dependentsCount!: number;

  @Column({ type: 'varchar', length: 255, name: 'emergency_contact_name', nullable: true })
  emergencyContactName!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'emergency_contact_relationship', nullable: true })
  emergencyContactRelationship!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'emergency_contact_phone', nullable: true })
  emergencyContactPhone!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'emergency_contact_email', nullable: true })
  emergencyContactEmail!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'employment_status', default: 'active' })
  employmentStatus!: string;

  @Column({ type: 'date', name: 'termination_date', nullable: true })
  terminationDate!: Date | null;

  @Column({ type: 'text', name: 'termination_reason', nullable: true })
  terminationReason!: string | null;

  @Column({ type: 'boolean', name: 'rehire_eligible', default: true })
  rehireEligible!: boolean;

  @Column({ type: 'varchar', length: 100, name: 'hire_source', nullable: true })
  hireSource!: string | null;

  @Column({ type: 'simple-array', nullable: true })
  badges!: string[];

  @Column({ type: 'time', name: 'work_start_time', nullable: true })
  workStartTime!: string | null;

  @Column({ type: 'time', name: 'work_end_time', nullable: true })
  workEndTime!: string | null;

  @Column({ type: 'simple-array', name: 'work_days', nullable: true })
  workDays!: string[];

  @Column({ type: 'int', name: 'annual_leave_days', nullable: true })
  annualLeaveDays!: number | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
