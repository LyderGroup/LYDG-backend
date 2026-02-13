import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../organizations/organizations.entity';
import { Kpi } from './kpi.entity';

@Entity({ schema: 'module_a_pilotage', name: 'kpi_values' })
export class KpiValue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'kpi_id' })
  kpiId!: string;

  @ManyToOne(() => Kpi, { nullable: false })
  @JoinColumn({ name: 'kpi_id' })
  kpi!: Kpi;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'date', name: 'period_start' })
  periodStart!: string;

  @Column({ type: 'date', name: 'period_end' })
  periodEnd!: string;

  @Column({ type: 'varchar', length: 20, name: 'period_type', nullable: true })
  periodType!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  value!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'target_value', nullable: true })
  targetValue!: string | null;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    nullable: true,
    insert: false,
    update: false,
  })
  variance!: string | null;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    name: 'variance_percentage',
    nullable: true,
    insert: false,
    update: false,
  })
  variancePercentage!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'warning_threshold', nullable: true })
  warningThreshold!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'critical_threshold', nullable: true })
  criticalThreshold!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  direction!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    insert: false,
    update: false,
  })
  status!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
