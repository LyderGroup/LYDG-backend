import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Candidate } from './candidate.entity';
import { JobOpening } from './job-opening.entity';

export type ApplicationStatus = 'active' | 'rejected' | 'offer_accepted' | 'offer_declined' | 'hired';

@Entity({ schema: 'module_c_rh', name: 'job_applications' })
export class JobApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'candidate_id' })
  candidateId!: string;

  @ManyToOne(() => Candidate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidate_id' })
  candidate!: Candidate;

  @Column({ type: 'uuid', name: 'job_opening_id' })
  jobOpeningId!: string;

  @ManyToOne(() => JobOpening, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_opening_id' })
  jobOpening!: JobOpening;

  @Column({ type: 'timestamp', name: 'application_date', default: () => 'CURRENT_TIMESTAMP' })
  applicationDate!: Date;

  @Column({ type: 'text', name: 'cover_letter', nullable: true })
  coverLetter!: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'screening_score', nullable: true })
  screeningScore!: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  stage!: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'final_status',
    default: 'active',
  })
  finalStatus!: ApplicationStatus;

  @Column({ type: 'uuid', name: 'workflow_instance_id', nullable: true })
  workflowInstanceId!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
