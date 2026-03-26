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
import { User } from '../../users/user.entity';
import { RegulationDocument } from './regulation-document.entity';
import { EmployeeRegulationAssignment } from './employee-regulation-assignment.entity';

export type RegulationStatus = 'draft' | 'active' | 'archived' | 'deprecated';

@Entity({ schema: 'module_c_rh', name: 'internal_regulations' })
export class InternalRegulation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 20 })
  version!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // Contenu
  @Column({ type: 'text', name: 'content_html' })
  contentHtml!: string;

  @Column({ type: 'text', name: 'content_summary', nullable: true })
  contentSummary!: string | null;

  // Fichiers
  @Column({ type: 'text', name: 'pdf_url', nullable: true })
  pdfUrl!: string | null;

  @Column({ type: 'timestamp', name: 'pdf_generated_at', nullable: true })
  pdfGeneratedAt!: Date | null;

  // Dates
  @Column({ type: 'date', name: 'effective_date' })
  effectiveDate!: Date;

  @Column({ type: 'date', name: 'expiry_date', nullable: true })
  expiryDate!: Date | null;

  // Statut
  @Column({
    type: 'varchar',
    length: 20,
    default: 'draft',
  })
  status!: RegulationStatus;

  // Configuration signature
  @Column({ type: 'boolean', name: 'requires_signature', default: true })
  requiresSignature!: boolean;

  @Column({ type: 'int', name: 'signature_deadline_days', default: 7 })
  signatureDeadlineDays!: number;

  @Column({ type: 'boolean', name: 'allow_download', default: false })
  allowDownload!: boolean;

  @Column({ type: 'boolean', name: 'allow_print', default: false })
  allowPrint!: boolean;

  @Column({ type: 'boolean', name: 'allow_copy', default: false })
  allowCopy!: boolean;

  // Métadonnées
  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User | null;

  @Column({ type: 'uuid', name: 'approved_by', nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approver?: User | null;

  @Column({ type: 'timestamp', name: 'approved_at', nullable: true })
  approvedAt!: Date | null;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @Column({ type: 'uuid', name: 'deleted_by', nullable: true })
  deletedBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => RegulationDocument, (doc) => doc.regulation)
  documents!: RegulationDocument[];

  @OneToMany(() => EmployeeRegulationAssignment, (assignment) => assignment.regulation)
  assignments!: EmployeeRegulationAssignment[];
}
