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
import { User } from '../../users/user.entity';

export type TrainingType = 'internal' | 'external' | 'online' | 'workshop';
export type TrainingStatus = 'planned' | 'open' | 'in_progress' | 'completed' | 'cancelled';

@Entity({ schema: 'module_c_rh', name: 'trainings' })
export class Training {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'training_type',
    nullable: true,
  })
  trainingType!: TrainingType | null;

  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate!: Date | null;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location!: string | null;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    name: 'cost_per_participant',
    nullable: true,
  })
  costPerParticipant!: number | null;

  @Column({ type: 'varchar', length: 3, default: 'XOF' })
  currency!: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'planned',
  })
  status!: TrainingStatus;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
