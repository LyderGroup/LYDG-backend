import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from './employee.entity';

/**
 * Types de documents obligatoires pour le dossier interne
 */
export enum RequiredDocumentType {
  BIRTH_CERTIFICATE = 'birth_certificate',           // Acte de naissance (légalisée)
  ID_PHOTO = 'id_photo',                             // Photo d'identité
  ID_COPY = 'id_copy',                               // Copie CNI/Passeport
  CV = 'cv',                                         // CV
  COVER_LETTER = 'cover_letter',                     // Lettre de motivation
  DIPLOMA = 'diploma',                               // Diplômes (peut être multiple)
  WORK_CERTIFICATE = 'work_certificate',             // Certificats de travail
  CRIMINAL_RECORD = 'criminal_record',               // Casier judiciaire
  CNSS_NUMBER = 'cnss_number',                       // Numéro CNSS (optionnel)
  INFO_FORM = 'info_form',                           // Fiche de renseignement
}

export enum DocumentStatus {
  PENDING = 'pending',           // En attente d'upload
  UPLOADED = 'uploaded',         // Uploadé, en attente de validation
  VALIDATED = 'validated',       // Validé par RH
  REJECTED = 'rejected',         // Rejeté (avec motif)
  EXPIRED = 'expired',           // Expiré (pour documents avec date d'expiration)
}

@Entity({ schema: 'module_c_rh', name: 'employee_required_documents' })
export class EmployeeRequiredDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({
    type: 'enum',
    enum: RequiredDocumentType,
    name: 'document_type',
  })
  documentType!: RequiredDocumentType;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.PENDING,
  })
  status!: DocumentStatus;

  // Fichier uploadé
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'file_path' })
  filePath!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'file_name' })
  fileName!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'file_mime_type' })
  fileMimeType!: string | null;

  @Column({ type: 'bigint', nullable: true, name: 'file_size' })
  fileSize!: number | null;

  // Pour CNSS, on stocke directement le numéro
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'text_value' })
  textValue!: string | null;

  // Date d'expiration (pour casier judiciaire, CNI, etc.)
  @Column({ type: 'date', nullable: true, name: 'expiry_date' })
  expiryDate!: Date | null;

  // Validation
  @Column({ type: 'uuid', nullable: true, name: 'validated_by' })
  validatedBy!: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'validated_at' })
  validatedAt!: Date | null;

  @Column({ type: 'text', nullable: true, name: 'rejection_reason' })
  rejectionReason!: string | null;

  // Métadonnées
  @Column({ type: 'boolean', name: 'is_optional', default: false })
  isOptional!: boolean;

  @Column({ type: 'date', name: 'due_date', nullable: true })
  dueDate!: Date | null;

  @Column({ type: 'timestamp', name: 'reminder_sent_at', nullable: true })
  reminderSentAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  // Relation vers l'organisation
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;
}
