import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/organizations.entity';
import { Employee } from '../employee.entity';
import { User } from '../../users/user.entity';

export type EvaluationLevel = 'EXCELLENCE' | 'PERFORMANT' | 'ACCEPTABLE' | 'INSUFFISANT' | 'CRITIQUE';
export type EvaluationStatus = 'draft' | 'submitted' | 'validated' | 'contested' | 'cancelled';

@Entity({ schema: 'module_c_rh', name: 'monthly_evaluations' })
export class MonthlyEvaluation {
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

  // Période
  @Column({ type: 'int', name: 'period_month' })
  periodMonth!: number;

  @Column({ type: 'int', name: 'period_year' })
  periodYear!: number;

  // Scores
  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'total_score' })
  totalScore!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'weighted_score' })
  weightedScore!: number;

  // Niveau
  @Column({
    type: 'varchar',
    length: 20,
  })
  level!: EvaluationLevel;

  @Column({ type: 'int', name: 'level_points' })
  levelPoints!: number;

  // Prime de performance
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    name: 'performance_bonus',
    nullable: true,
  })
  performanceBonus!: number | null;

  @Column({
    type: 'varchar',
    length: 3,
    name: 'bonus_currency',
    default: 'XOF',
  })
  bonusCurrency!: string;

  // Statut
  @Column({
    type: 'varchar',
    length: 20,
    default: 'draft',
  })
  status!: EvaluationStatus;

  // Évaluateurs
  @Column({ type: 'uuid', name: 'evaluated_by', nullable: true })
  evaluatedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'evaluated_by' })
  evaluator?: User | null;

  @Column({ type: 'date', name: 'evaluation_date', nullable: true })
  evaluationDate!: Date | null;

  @Column({ type: 'uuid', name: 'validated_by', nullable: true })
  validatedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'validated_by' })
  validator?: User | null;

  @Column({ type: 'timestamp', name: 'validated_at', nullable: true })
  validatedAt!: Date | null;

  // Contestation
  @Column({ type: 'text', name: 'contestation_notes', nullable: true })
  contestationNotes!: string | null;

  @Column({ type: 'timestamp', name: 'contestation_date', nullable: true })
  contestationDate!: Date | null;

  @Column({ type: 'text', name: 'contestation_resolution', nullable: true })
  contestationResolution!: string | null;

  @Column({ type: 'timestamp', name: 'contestation_resolved_at', nullable: true })
  contestationResolvedAt!: Date | null;

  // Commentaires
  @Column({ type: 'text', nullable: true })
  strengths!: string | null;

  @Column({ type: 'text', name: 'areas_for_improvement', nullable: true })
  areasForImprovement!: string | null;

  @Column({ type: 'text', nullable: true })
  recommendations!: string | null;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany('EvaluationKpiScore', 'kpiScores')
  kpiScores!: any[];
}
