import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../organizations/organizations.entity';

@Index('uq_contact_types_org_code', ['organizationId', 'code'], { unique: true })
@Entity({ schema: 'module_d_finance', name: 'contact_types' })
export class ContactType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  // Champs ajoutés par core.attach_audit_columns (module_d_finance_v2)
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true, select: false })
  deletedAt!: Date | null;
}
