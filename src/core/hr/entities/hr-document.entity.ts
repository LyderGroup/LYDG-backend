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
import { HrDocumentAssignment } from './hr-document-assignment.entity';

export type HrDocumentType = 'CONTRACT' | 'AMENDMENT' | 'GDE' | 'POLICY' | 'PROCEDURE' | 'FORM' | 'OTHER';
export type HrDocumentStatus = 'draft' | 'active' | 'archived' | 'deprecated';
export type HrDocumentAction = 'READ_ONLY' | 'SIGN_REQUIRED' | 'ACKNOWLEDGE';

@Entity({ schema: 'module_c_rh', name: 'hr_documents' })
export class HrDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  // Type et classification
  @Column({
    type: 'varchar',
    length: 50,
    name: 'document_type',
  })
  documentType!: HrDocumentType;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 100, name: 'reference_code', nullable: true })
  referenceCode!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // Fichier
  @Column({ type: 'text', name: 'file_url' })
  fileUrl!: string;

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName!: string;

  @Column({ type: 'bigint', name: 'file_size', nullable: true })
  fileSize!: number | null;

  @Column({ type: 'varchar', length: 100, name: 'mime_type', nullable: true })
  mimeType!: string | null;

  // Version
  @Column({ type: 'varchar', length: 20, default: '1.0' })
  version!: string;

  @Column({ type: 'uuid', name: 'previous_version_id', nullable: true })
  previousVersionId!: string | null;

  @ManyToOne(() => HrDocument, { nullable: true })
  @JoinColumn({ name: 'previous_version_id' })
  previousVersion?: HrDocument | null;

  // Action requise
  @Column({
    type: 'varchar',
    length: 20,
    name: 'required_action',
    default: 'READ_ONLY',
  })
  requiredAction!: HrDocumentAction;

  @Column({ type: 'boolean', name: 'requires_signature', default: false })
  requiresSignature!: boolean;

  @Column({ type: 'int', name: 'deadline_days', nullable: true })
  deadlineDays!: number | null;

  // Permissions
  @Column({ type: 'boolean', name: 'allow_download', default: false })
  allowDownload!: boolean;

  @Column({ type: 'boolean', name: 'allow_print', default: false })
  allowPrint!: boolean;

  // Statut
  @Column({
    type: 'varchar',
    length: 20,
    default: 'draft',
  })
  status!: HrDocumentStatus;

  // Dates
  @Column({ type: 'date', name: 'effective_date', nullable: true })
  effectiveDate!: Date | null;

  @Column({ type: 'date', name: 'expiry_date', nullable: true })
  expiryDate!: Date | null;

  // Créateur
  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User | null;

  // Publication
  @Column({ type: 'timestamp', name: 'published_at', nullable: true })
  publishedAt!: Date | null;

  @Column({ type: 'uuid', name: 'published_by', nullable: true })
  publishedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'published_by' })
  publisher?: User | null;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => HrDocumentAssignment, (assignment) => assignment.document)
  assignments!: HrDocumentAssignment[];
}
