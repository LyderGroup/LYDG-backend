import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../../organizations/organizations.entity';
import { Employee } from '../employee.entity';
import { User } from '../../users/user.entity';

export type SignatureDocumentType = 'REGULATION' | 'CONTRACT' | 'AMENDMENT' | 'ADDENDUM' | 'SANCTION' | 'OTHER';
export type SignatureStatus = 'valid' | 'revoked' | 'expired' | 'contested';

@Entity({ schema: 'module_c_rh', name: 'electronic_signatures' })
export class ElectronicSignature {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;
 
  @Column({
    type: 'varchar',
    length: 50,
    name: 'document_type',
  })
  documentType!: SignatureDocumentType;

  @Column({ type: 'uuid', name: 'document_id' })
  documentId!: string;

  @Column({ type: 'varchar', length: 20, name: 'document_version', nullable: true })
  documentVersion!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'document_hash' })
  documentHash!: string;
 
  @Column({ type: 'uuid', name: 'employee_id', nullable: true })
  employeeId!: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employee_id' })
  employee?: Employee | null;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ type: 'varchar', length: 255, name: 'signer_name' })
  signerName!: string;

  @Column({ type: 'varchar', length: 255, name: 'signer_email' })
  signerEmail!: string;
 
  @Column({ type: 'text', name: 'signature_data', nullable: true })
  signatureData!: string | null;

  @Column({ type: 'text', name: 'signature_image_url', nullable: true })
  signatureImageUrl!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'signature_hash' })
  signatureHash!: string;
 
  @Column({ type: 'varchar', length: 45, name: 'ip_address', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'text', name: 'device_fingerprint', nullable: true })
  deviceFingerprint!: string | null;

  @Column({ type: 'jsonb', default: {} })
  geolocation!: Record<string, any>;
 
  @Column({ type: 'timestamp', name: 'signed_at' })
  signedAt!: Date;
 
  @Column({ type: 'varchar', length: 20, name: 'verification_code', unique: true })
  verificationCode!: string;

  @Column({ type: 'text', name: 'verification_qr_code', nullable: true })
  verificationQrCode!: string | null;

  @Column({ type: 'timestamp', name: 'verified_at', nullable: true })
  verifiedAt!: Date | null;
 
  @Column({
    type: 'varchar',
    length: 20,
    default: 'valid',
  })
  status!: SignatureStatus;

  @Column({ type: 'text', name: 'revocation_reason', nullable: true })
  revocationReason!: string | null;

  @Column({ type: 'timestamp', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'uuid', name: 'revoked_by', nullable: true })
  revokedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'revoked_by' })
  revoker?: User | null;
 
  @Column({ type: 'text', name: 'signed_pdf_url', nullable: true })
  signedPdfUrl!: string | null;

  @Column({ type: 'timestamp', name: 'signed_pdf_generated_at', nullable: true })
  signedPdfGeneratedAt!: Date | null;
 
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
