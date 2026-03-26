import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InternalRegulation } from './internal-regulation.entity';

export type RegulationDocumentType = 'MAIN' | 'ANNEX' | 'AMENDMENT' | 'APPENDIX';

@Entity({ schema: 'module_c_rh', name: 'regulation_documents' })
export class RegulationDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'regulation_id' })
  regulationId!: string;

  @ManyToOne(() => InternalRegulation, (reg) => reg.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'regulation_id' })
  regulation!: InternalRegulation;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'document_type',
  })
  documentType!: RegulationDocumentType;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // Fichier
  @Column({ type: 'text', name: 'file_url' })
  fileUrl!: string;

  @Column({ type: 'text', name: 'file_encryption_key', nullable: true })
  fileEncryptionKey!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName!: string;

  @Column({ type: 'bigint', name: 'file_size', nullable: true })
  fileSize!: number | null;

  @Column({ type: 'varchar', length: 100, name: 'mime_type', nullable: true })
  mimeType!: string | null;

  // Protection
  @Column({ type: 'boolean', name: 'is_protected', default: true })
  isProtected!: boolean;

  @Column({ type: 'boolean', name: 'allow_download', default: false })
  allowDownload!: boolean;

  @Column({ type: 'boolean', name: 'allow_print', default: false })
  allowPrint!: boolean;

  @Column({ type: 'int', name: 'display_order', default: 0 })
  displayOrder!: number;

  @Column({ type: 'boolean', name: 'is_required', default: true })
  isRequired!: boolean;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
