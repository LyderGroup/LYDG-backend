import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../../organizations/organizations.entity';
import { Kpi } from './kpi.entity';

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
@Entity({ schema: 'module_c_rh', name: 'kpi_weights' })
export class KpiWeight {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'uuid', name: 'position_id' })
  positionId!: string;

  @Column({ type: 'uuid', name: 'kpi_id' })
  kpiId!: string;

  @ManyToOne(() => Kpi, (kpi) => kpi.weights, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'kpi_id' })
  kpi!: Kpi;

  @Column({
    type: 'decimal',
    transformer: numericTransformer,
    precision: 5,
    scale: 2,
    name: 'weight_percent',
  })
  weightPercent!: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
