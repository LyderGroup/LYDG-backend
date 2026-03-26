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
import { JobPosition } from './job-position.entity';
import { User } from '../../users/user.entity';

export type JobOpeningStatus =
  | 'draft'
  | 'approved'
  | 'published'
  | 'interviewing'
  | 'offer_pending'
  | 'filled'
  | 'cancelled';

@Entity({ schema: 'module_c_rh', name: 'job_openings' })
export class JobOpening {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'uuid', name: 'position_id', nullable: true })
  positionId!: string | null;

  @ManyToOne(() => JobPosition, { nullable: true })
  @JoinColumn({ name: 'position_id' })
  position?: JobPosition | null;

  @Column({ type: 'varchar', length: 255, name: 'job_title' })
  jobTitle!: string;

  @Column({ type: 'uuid', name: 'department_id', nullable: true })
  departmentId!: string | null;

  @ManyToOne(() => HrDepartment, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department?: HrDepartment | null;

  @Column({ type: 'text', name: 'job_description', nullable: true })
  jobDescription!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'employment_type', nullable: true })
  employmentType!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'experience_level', nullable: true })
  experienceLevel!: string | null;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    name: 'salary_range_min',
    nullable: true,
  })
  salaryRangeMin!: number | null;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    name: 'salary_range_max',
    nullable: true,
  })
  salaryRangeMax!: number | null;

  @Column({ type: 'varchar', length: 3, default: 'XOF' })
  currency!: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'draft',
  })
  status!: JobOpeningStatus;

  @Column({ type: 'date', name: 'opening_date', default: () => 'CURRENT_DATE' })
  openingDate!: Date;

  @Column({ type: 'date', name: 'closing_date', nullable: true })
  closingDate!: Date | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
