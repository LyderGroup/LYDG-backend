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
export type ReviewType = 'regular' | 'probation' | 'promotion' | 'annual';
export type ReviewStatus =
  | 'draft'
  | 'self_assessment'
  | 'manager_review'
  | 'hr_review'
  | 'approved'
  | 'completed'
  | 'cancelled';

@Entity({ schema: 'module_c_rh', name: 'performance_reviews' })
export class PerformanceReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'varchar', length: 20, name: 'review_period' })
  reviewPeriod!: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'review_type',
    default: 'regular',
  })
  reviewType!: ReviewType;

  @Column({ type: 'date', name: 'review_date' })
  reviewDate!: Date;

  @Column({ type: 'date', name: 'next_review_date', nullable: true })
  nextReviewDate!: Date | null;

  @Column({ type: 'uuid', name: 'reviewer_id', nullable: true })
  reviewerId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer?: User | null;

  @Column({ type: 'uuid', name: 'hr_reviewer_id', nullable: true })
  hrReviewerId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'hr_reviewer_id' })
  hrReviewer?: User | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 3, scale: 2, name: 'overall_rating', nullable: true })
  overallRating!: number | null;

  @Column({ type: 'varchar', length: 50, name: 'rating_scale', default: '1-5' })
  ratingScale!: string;

  @Column({ type: 'text', nullable: true })
  strengths!: string | null;

  @Column({ type: 'text', name: 'areas_for_improvement', nullable: true })
  areasForImprovement!: string | null;

  @Column({ type: 'text', name: 'development_plan', nullable: true })
  developmentPlan!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  recommendation!: string | null;

  @Column({
    type: 'decimal',
    transformer: numericTransformer,
    precision: 5,
    scale: 2,
    name: 'salary_increase_percentage',
    nullable: true,
  })
  salaryIncreasePercentage!: number | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'draft',
  })
  status!: ReviewStatus;

  @Column({ type: 'uuid', name: 'workflow_instance_id', nullable: true })
  workflowInstanceId!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
