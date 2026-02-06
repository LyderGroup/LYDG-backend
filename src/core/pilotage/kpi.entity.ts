import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/organizations.entity';
import { User } from '../users/user.entity';
import { StrategicObjective } from './strategic-objective.entity';

@Entity({ schema: 'module_a_pilotage', name: 'kpis' })
export class Kpi {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'uuid', name: 'objective_id', nullable: true })
  objectiveId!: string | null;

  @ManyToOne(() => StrategicObjective, { nullable: true })
  @JoinColumn({ name: 'objective_id' })
  objective?: StrategicObjective | null;

  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  frequency!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  unit!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  direction!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'target_value', nullable: true })
  targetValue!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'warning_threshold', nullable: true })
  warningThreshold!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'critical_threshold', nullable: true })
  criticalThreshold!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', name: 'is_visible_dashboard', default: true })
  isVisibleDashboard!: boolean;

  @Column({ type: 'int', name: 'display_order', default: 0 })
  displayOrder!: number;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdByUser?: User | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
