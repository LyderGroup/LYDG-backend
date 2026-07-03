import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Candidate } from './candidate.entity';
import { JobOpening } from './job-opening.entity';
import { Organization } from '../../organizations/organizations.entity';

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
export type ApplicationStatus = 'active' | 'rejected' | 'offer_accepted' | 'offer_declined' | 'hired';

@Index('idx_job_applications_org_date', ['organizationId', 'applicationDate'])
@Entity({ schema: 'module_c_rh', name: 'job_applications' })
export class JobApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // ─── Multi-tenant : la candidature appartient à l'org propriétaire de l'offre.
  // Les recruteurs d'une org ne voient QUE leurs candidatures via ce filtre.
  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

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

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 5, scale: 2, name: 'screening_score', nullable: true })
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

  // ─── Snapshot des données du candidat au moment de la candidature ────────
  // Évite que la modification du Candidate altère l'historique. Aussi utile
  // pour les requêtes recruteur sans jointure systématique.
  @Column({ type: 'varchar', length: 255, name: 'applicant_full_name', nullable: true })
  applicantFullName!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'applicant_email', nullable: true })
  applicantEmail!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'applicant_phone', nullable: true })
  applicantPhone!: string | null;

  // ─── CV : URL externe (Supabase/S3) + métadonnées de validation ─────────
  @Column({ type: 'text', name: 'cv_url', nullable: true })
  cvUrl!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'cv_mime_type', nullable: true })
  cvMimeType!: string | null;

  @Column({ type: 'int', name: 'cv_size_bytes', nullable: true })
  cvSizeBytes!: number | null;

  // ─── Tracking anti-spam : IP, user-agent, fingerprint ──────────────────
  @Column({ type: 'varchar', length: 45, name: 'applicant_ip', nullable: true })
  applicantIp!: string | null;

  @Column({ type: 'text', name: 'applicant_user_agent', nullable: true })
  applicantUserAgent!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'applicant_device_fingerprint', nullable: true })
  applicantDeviceFingerprint!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'public_website', nullable: true })
  source!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
