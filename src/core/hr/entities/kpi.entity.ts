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
import { KpiWeight } from './kpi-weight.entity';
import { EvaluationKpiScore } from './evaluation-kpi-score.entity';

export interface ScoringRule {
  min: number;
  max: number;
  points: number;
  label?: string;
}

@Entity({ schema: 'module_c_rh', name: 'kpis' })
export class Kpi {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category!: string | null;

  // Pondération par défaut
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    name: 'default_weight_percent',
  })
  defaultWeightPercent!: number;

  // Règles de notation
  @Column({ type: 'jsonb', name: 'scoring_rules', default: [] })
  scoringRules!: ScoringRule[];

  // Source de données
  @Column({ type: 'varchar', length: 50, name: 'data_source', nullable: true })
  dataSource!: string | null;

  @Column({ type: 'text', name: 'calculation_formula', nullable: true })
  calculationFormula!: string | null;

  @Column({ type: 'boolean', name: 'auto_calculate', default: false })
  autoCalculate!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'int', name: 'display_order', default: 0 })
  displayOrder!: number;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => KpiWeight, (weight) => weight.kpi)
  weights!: KpiWeight[];

  @OneToMany(() => EvaluationKpiScore, (score) => score.kpi)
  scores!: EvaluationKpiScore[];
}
