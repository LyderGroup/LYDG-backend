import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employee.entity';
import { HrDocument } from './hr-document.entity';
import { User } from '../../users/user.entity';

export type HrAssignmentStatus = 'pending' | 'viewed' | 'acknowledged' | 'signed' | 'rejected' | 'expired';

@Entity({ schema: 'module_c_rh', name: 'hr_document_assignments' })
export class HrDocumentAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'uuid', name: 'document_id' })
  documentId!: string;

  @ManyToOne(() => HrDocument, (doc) => doc.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: HrDocument;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  // Assignation
  @Column({ type: 'timestamp', name: 'assigned_at', default: () => 'CURRENT_TIMESTAMP' })
  assignedAt!: Date;

  @Column({ type: 'uuid', name: 'assigned_by', nullable: true })
  assignedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_by' })
  assigner?: User | null;

  @Column({ type: 'date', name: 'due_date', nullable: true })
  dueDate!: Date | null;

  // Notifications
  @Column({ type: 'timestamp', name: 'notification_sent_at', nullable: true })
  notificationSentAt!: Date | null;

  @Column({ type: 'int', name: 'reminder_count', default: 0 })
  reminderCount!: number;

  @Column({ type: 'timestamp', name: 'last_reminder_at', nullable: true })
  lastReminderAt!: Date | null;

  // Statut
  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  status!: HrAssignmentStatus;

  // Accès au document
  @Column({ type: 'timestamp', name: 'first_viewed_at', nullable: true })
  firstViewedAt!: Date | null;

  @Column({ type: 'int', name: 'view_count', default: 0 })
  viewCount!: number;

  @Column({ type: 'timestamp', name: 'last_viewed_at', nullable: true })
  lastViewedAt!: Date | null;

  @Column({ type: 'int', name: 'total_time_spent', default: 0 })
  totalTimeSpent!: number; // en secondes

  // Signature (si requise)
  @Column({ type: 'uuid', name: 'signature_id', nullable: true })
  signatureId!: string | null;

  @Column({ type: 'timestamp', name: 'signed_at', nullable: true })
  signedAt!: Date | null;

  @Column({ type: 'text', name: 'signature_data', nullable: true })
  signatureData!: string | null;

  @Column({ type: 'text', name: 'signature_image_url', nullable: true })
  signatureImageUrl!: string | null;

  // Rejet
  @Column({ type: 'text', name: 'rejection_reason', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'timestamp', name: 'rejected_at', nullable: true })
  rejectedAt!: Date | null;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
