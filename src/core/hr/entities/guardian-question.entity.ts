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

@Entity({ schema: 'module_c_rh', name: 'guardian_questions' })
export class GuardianQuestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'date', name: 'question_date' })
  questionDate!: Date;

  // The 5 Guardian Questions with Yes/No answers
  @Column({ type: 'boolean', name: 'q1_client_interest', default: false })
  q1ClientInterest!: boolean;

  @Column({ type: 'boolean', name: 'q2_reputation', default: false })
  q2Reputation!: boolean;

  @Column({ type: 'boolean', name: 'q3_engagement', default: false })
  q3Engagement!: boolean;

  @Column({ type: 'boolean', name: 'q4_respectful_relations', default: false })
  q4RespectfulRelations!: boolean;

  @Column({ type: 'boolean', name: 'q5_success_contribution', default: false })
  q5SuccessContribution!: boolean;

  // Calculated score (number of Yes answers)
  @Column({ type: 'int', name: 'yes_count', default: 0 })
  yesCount!: number;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
