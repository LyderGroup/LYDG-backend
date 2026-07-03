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
import { Organization } from '../../organizations/organizations.entity';
import { User } from '../../users/user.entity';
import { DocumentLibrary } from './document-library.entity';
import type { ConfidentialityLevel } from '../documents.permissions';

@Index('idx_folders_library_parent', ['libraryId', 'parentFolderId'])
@Index('idx_folders_org', ['organizationId'])
@Entity({ schema: 'module_f_documents', name: 'folders' })
export class Folder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'uuid', name: 'library_id' })
  libraryId!: string;

  @ManyToOne(() => DocumentLibrary, { nullable: false })
  @JoinColumn({ name: 'library_id' })
  library?: DocumentLibrary;

  @Column({ type: 'uuid', name: 'parent_folder_id', nullable: true })
  parentFolderId!: string | null;

  @ManyToOne(() => Folder, { nullable: true })
  @JoinColumn({ name: 'parent_folder_id' })
  parentFolder?: Folder | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  // `path` est recalculé par le trigger SQL `recompute_folder_path()` (v2).
  // En lecture seule côté ORM : INSERT/UPDATE laissent le trigger gérer.
  @Column({ type: 'text', nullable: true, insert: false, update: false })
  path!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'confidentiality_level', default: 'internal' })
  confidentialityLevel!: ConfidentialityLevel;

  @Column({ type: 'boolean', name: 'is_public', default: false })
  isPublic!: boolean;

  @Column({ type: 'uuid', name: 'owner_id', nullable: true })
  ownerId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner?: User | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true, select: false })
  deletedAt!: Date | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true, select: false })
  createdBy!: string | null;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true, select: false })
  updatedBy!: string | null;
}
