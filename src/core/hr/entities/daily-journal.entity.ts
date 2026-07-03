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

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
@Entity({ schema: 'module_c_rh', name: 'daily_journals' })
export class DailyJournal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'date', name: 'journal_date' })
  journalDate!: Date;

  @Column({ type: 'text', name: 'accomplishments', nullable: true })
  accomplishments!: string | null;

  @Column({ type: 'text', name: 'challenges', nullable: true })
  challenges!: string | null;

  @Column({ type: 'text', name: 'learnings', nullable: true })
  learnings!: string | null;

  @Column({ type: 'text', name: 'tomorrow_plan', nullable: true })
  tomorrowPlan!: string | null;

  @Column({ type: 'text', nullable: true })
  mood!: string | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 3, scale: 1, name: 'productivity_score', nullable: true })
  productivityScore!: number | null;

  @Column({ type: 'boolean', name: 'is_submitted', default: false })
  isSubmitted!: boolean;

  @Column({ type: 'timestamp', name: 'submitted_at', nullable: true })
  submittedAt!: Date | null;

  @Column({ type: 'uuid', name: 'reviewed_by', nullable: true })
  reviewedBy!: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer?: Employee | null;

  @Column({ type: 'timestamp', name: 'reviewed_at', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'text', name: 'manager_feedback', nullable: true })
  managerFeedback!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
