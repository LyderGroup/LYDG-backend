import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/organizations.entity';

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
export type SalaryComponentType = 
  | 'BASE' 
  | 'DISPLACEMENT' 
  | 'CONNECTION' 
  | 'TERRAIN' 
  | 'SENIORITY' 
  | 'RETENTION' 
  | 'PERFORMANCE' 
  | 'FORMATION'
  | 'CERTIFICATION' 
  | 'TERRAIN_BONUS' 
  | 'OTHER';

export type CalculationType = 'fixed' | 'per_day' | 'per_unit' | 'percentage';

@Entity({ schema: 'module_c_rh', name: 'salary_components' })
export class SalaryComponent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'uuid', name: 'position_id' })
  positionId!: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'component_type',
  })
  componentType!: SalaryComponentType;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 15, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'XOF' })
  currency!: string;

  // Conditions
  @Column({ type: 'jsonb', default: {} })
  conditions!: Record<string, any>;

  // Calcul
  @Column({
    type: 'varchar',
    length: 20,
    name: 'calculation_type',
    default: 'fixed',
  })
  calculationType!: CalculationType;

  @Column({ type: 'varchar', length: 50, name: 'calculation_base', nullable: true })
  calculationBase!: string | null;

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
}
