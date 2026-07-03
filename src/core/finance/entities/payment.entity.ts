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
import { Contact } from './contact.entity';
import { Invoice } from './invoice.entity';
import { numericTransformer } from '../../../common/typeorm/numeric-transformer';

export type PaymentStatus = 'pending' | 'received' | 'reconciled' | 'refunded' | 'cancelled';

export type PaymentMethod = 'cash' | 'check' | 'wire' | 'card' | 'mobile_money' | 'other';

@Index('idx_payments_org_date', ['organizationId', 'paymentDate'])
@Index('idx_payments_invoice', ['invoiceId'])
@Index('uq_payments_org_number', ['organizationId', 'paymentNumber'], { unique: true })
@Entity({ schema: 'module_d_finance', name: 'payments' })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'uuid', name: 'invoice_id', nullable: true })
  invoiceId!: string | null;

  @ManyToOne(() => Invoice, { nullable: true })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: Invoice | null;

  @Column({ type: 'uuid', name: 'contact_id', nullable: true })
  contactId!: string | null;

  @ManyToOne(() => Contact, { nullable: true })
  @JoinColumn({ name: 'contact_id' })
  contact?: Contact | null;

  @Column({ type: 'varchar', length: 50, name: 'payment_number' })
  paymentNumber!: string;

  @Column({ type: 'date', name: 'payment_date' })
  paymentDate!: Date;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'XOF' })
  currency!: string;

  @Column({ type: 'varchar', length: 50, name: 'payment_method', nullable: true })
  paymentMethod!: PaymentMethod | null;

  @Column({ type: 'varchar', length: 50, default: 'received' })
  status!: PaymentStatus;

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
