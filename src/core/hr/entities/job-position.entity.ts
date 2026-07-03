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
import { HrDepartment } from './department.entity';

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
@Entity({ schema: 'module_c_rh', name: 'job_positions' })
export class JobPosition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'uuid', name: 'department_id', nullable: true })
  departmentId!: string | null;

  @ManyToOne(() => HrDepartment, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department?: HrDepartment | null;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'job_family', nullable: true })
  jobFamily!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'job_level', nullable: true })
  jobLevel!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'salary_grade', nullable: true })
  salaryGrade!: string | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 15, scale: 2, name: 'min_salary', nullable: true })
  minSalary!: number | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 15, scale: 2, name: 'max_salary', nullable: true })
  maxSalary!: number | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
