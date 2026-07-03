import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Kpi } from './kpi.entity';

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
@Entity({ schema: 'module_c_rh', name: 'evaluation_kpi_scores' })
export class EvaluationKpiScore {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'evaluation_id' })
  evaluationId!: string;

  @ManyToOne('MonthlyEvaluation', 'evaluation', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evaluation_id' })
  evaluation!: any;

  @Column({ type: 'uuid', name: 'kpi_id' })
  kpiId!: string;

  @ManyToOne(() => Kpi, (kpi) => kpi.scores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'kpi_id' })
  kpi!: Kpi;

  // Score brut
  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 5, scale: 2, name: 'raw_score' })
  rawScore!: number;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 10, scale: 2, name: 'raw_value', nullable: true })
  rawValue!: number | null;

  @Column({ type: 'varchar', length: 20, name: 'raw_value_unit', nullable: true })
  rawValueUnit!: string | null;

  // Score calculé
  @Column({ type: 'int', name: 'calculated_score' })
  calculatedScore!: number;

  @Column({ type: 'varchar', length: 50, name: 'score_level', nullable: true })
  scoreLevel!: string | null;

  // Pondération
  @Column({
    type: 'decimal',
    transformer: numericTransformer,
    precision: 5,
    scale: 2,
    name: 'weight_percent',
  })
  weightPercent!: number;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 5, scale: 2, name: 'weighted_score' })
  weightedScore!: number;

  // Détails
  @Column({ type: 'jsonb', default: {} })
  details!: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
