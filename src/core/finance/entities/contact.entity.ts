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
import { ContactType } from './contact-type.entity';
import { ContactCategory } from './contact-category.entity';

export type ContactStatus = 'active' | 'prospect' | 'inactive' | 'blocked';

@Index('idx_contacts_org_active', ['organizationId', 'isActive'])
@Index('idx_contacts_org_search', ['organizationId', 'companyName'])
@Entity({ schema: 'module_d_finance', name: 'contacts' })
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'uuid', name: 'contact_type_id', nullable: true })
  contactTypeId!: string | null;

  @ManyToOne(() => ContactType, { nullable: true })
  @JoinColumn({ name: 'contact_type_id' })
  contactType?: ContactType | null;

  @Column({ type: 'uuid', name: 'category_id', nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => ContactCategory, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: ContactCategory | null;

  @Column({ type: 'boolean', name: 'is_customer', default: false })
  isCustomer!: boolean;

  @Column({ type: 'boolean', name: 'is_supplier', default: false })
  isSupplier!: boolean;

  @Column({ type: 'boolean', name: 'is_partner', default: false })
  isPartner!: boolean;

  @Column({ type: 'varchar', length: 255, name: 'company_name', nullable: true })
  companyName!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'first_name', nullable: true })
  firstName!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'last_name', nullable: true })
  lastName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country!: string | null;

  @Column({ type: 'integer', name: 'payment_terms_days', default: 30 })
  paymentTermsDays!: number;

  @Column({ type: 'uuid', name: 'assigned_to', nullable: true })
  assignedTo!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_to' })
  assignee?: User | null;

  @Column({ type: 'varchar', length: 50, name: 'customer_status', default: 'active' })
  customerStatus!: ContactStatus;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

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
