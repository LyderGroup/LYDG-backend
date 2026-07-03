import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/organizations.entity';
import { Contact } from './contact.entity';
import { InvoiceItem } from './invoice-item.entity';
import { numericTransformer } from '../../../common/typeorm/numeric-transformer';

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'cancelled';

@Index('idx_invoices_org_status', ['organizationId', 'status'])
@Index('idx_invoices_org_due', ['organizationId', 'dueDate'])
@Index('uq_invoices_org_number', ['organizationId', 'invoiceNumber'], { unique: true })
@Entity({ schema: 'module_d_finance', name: 'invoices' })
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'uuid', name: 'contact_id', nullable: true })
  contactId!: string | null;

  @ManyToOne(() => Contact, { nullable: true })
  @JoinColumn({ name: 'contact_id' })
  contact?: Contact | null;

  // Lien optionnel vers un projet du module B (projets & tâches)
  @Column({ type: 'uuid', name: 'project_id', nullable: true })
  projectId!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'invoice_number' })
  invoiceNumber!: string;

  @Column({ type: 'date', name: 'issue_date' })
  issueDate!: Date;

  @Column({ type: 'date', name: 'due_date' })
  dueDate!: Date;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status!: InvoiceStatus;

  @Column({ type: 'varchar', length: 3, default: 'XOF' })
  currency!: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: numericTransformer,
    default: 0,
  })
  subtotal!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: numericTransformer,
    name: 'tax_amount',
    default: 0,
  })
  taxAmount!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: numericTransformer,
    name: 'total_amount',
    default: 0,
  })
  totalAmount!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: numericTransformer,
    name: 'paid_amount',
    default: 0,
  })
  paidAmount!: number;

  // Colonne calculée par PostgreSQL (GENERATED ALWAYS AS (total - paid) STORED).
  // En lecture seule côté ORM — TypeORM ne tente pas de l'écrire.
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: numericTransformer,
    name: 'balance_amount',
    insert: false,
    update: false,
  })
  balanceAmount!: number;

  @OneToMany(() => InvoiceItem, (item) => item.invoice)
  items?: InvoiceItem[];

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
