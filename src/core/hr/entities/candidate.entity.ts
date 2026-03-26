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

export type CandidateStatus = 'new' | 'screened' | 'interview' | 'offer' | 'hired' | 'rejected';

@Entity({ schema: 'module_c_rh', name: 'candidates' })
export class Candidate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'varchar', length: 100, name: 'first_name' })
  firstName!: string;

  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  lastName!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'current_position', nullable: true })
  currentPosition!: string | null;

  @Column({ type: 'int', name: 'total_experience_years', nullable: true })
  totalExperienceYears!: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  source!: string | null;

  @Column({ type: 'text', name: 'resume_url', nullable: true })
  resumeUrl!: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'new',
  })
  status!: CandidateStatus;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany('JobApplication', 'candidate')
  applications!: any[];
}
