import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../../organizations/organizations.entity';

export type BonusCategory = 'PERFORMANCE' | 'EXCEPTIONAL' | 'RETENTION' | 'CERTIFICATION' | 'TERRAIN' | 'OTHER';

@Entity({ schema: 'module_c_rh', name: 'bonus_types' })
export class BonusType {
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

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  category!: BonusCategory | null;

  // Montant
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  amount!: number | null;

  @Column({ type: 'varchar', length: 3, default: 'XOF' })
  currency!: string;

  @Column({ type: 'varchar', length: 50, name: 'percentage_base', nullable: true })
  percentageBase!: string | null;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    name: 'percentage_value',
    nullable: true,
  })
  percentageValue!: number | null;
 
  @Column({ type: 'jsonb', default: {} })
  conditions!: Record<string, any>;

  @Column({ type: 'boolean', name: 'auto_calculate', default: false })
  autoCalculate!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', name: 'is_taxable', default: true })
  isTaxable!: boolean;
 
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
