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

import { numericTransformer } from '../../common/typeorm/numeric-transformer';
@Entity({ schema: 'module_a_pilotage', name: 'strategic_objectives' })
export class StrategicObjective {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'uuid', name: 'parent_objective_id', nullable: true })
  parentObjectiveId!: string | null;

  @ManyToOne(() => StrategicObjective, { nullable: true })
  @JoinColumn({ name: 'parent_objective_id' })
  parentObjective?: StrategicObjective | null;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'objective_type', nullable: true })
  objectiveType!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'period_type', nullable: true })
  periodType!: string | null;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int', nullable: true })
  quarter!: number | null;

  @Column({ type: 'date', name: 'start_date' })
  startDate!: string;

  @Column({ type: 'date', name: 'end_date' })
  endDate!: string;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 15, scale: 2, name: 'target_value', nullable: true })
  targetValue!: string | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 15, scale: 2, name: 'current_value', default: 0 })
  currentValue!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  unit!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status!: string;

  @Column({ type: 'uuid', name: 'owner_id', nullable: true })
  ownerId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner?: User | null;

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
