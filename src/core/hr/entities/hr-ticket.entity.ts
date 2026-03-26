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
import { Employee } from '../employee.entity';
import { User } from '../../users/user.entity';
import { HrTicketComment } from './hr-ticket-comment.entity';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus = 
  | 'open' 
  | 'in_progress' 
  | 'waiting_employee' 
  | 'waiting_manager' 
  | 'waiting_external' 
  | 'resolved' 
  | 'closed' 
  | 'reopened';
export type TicketSource = 'portal' | 'email' | 'phone' | 'chat' | 'api';

@Entity({ schema: 'module_c_rh', name: 'hr_tickets' })
export class HrTicket {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'uuid', name: 'category_id' })
  categoryId!: string;

  // Identification
  @Column({ type: 'varchar', length: 20, name: 'ticket_number', unique: true })
  ticketNumber!: string;

  // Contenu
  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'normal',
  })
  priority!: TicketPriority;

  // Statut
  @Column({
    type: 'varchar',
    length: 20,
    default: 'open',
  })
  status!: TicketStatus;

  // Assignation
  @Column({ type: 'uuid', name: 'assigned_to', nullable: true })
  assignedTo!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_to' })
  assignee?: User | null;

  @Column({ type: 'timestamp', name: 'assigned_at', nullable: true })
  assignedAt!: Date | null;

  // Résolution
  @Column({ type: 'uuid', name: 'resolved_by', nullable: true })
  resolvedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by' })
  resolver?: User | null;

  @Column({ type: 'timestamp', name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'text', name: 'resolution_notes', nullable: true })
  resolutionNotes!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'resolution_type', nullable: true })
  resolutionType!: string | null;

  // Dates
  @Column({ type: 'date', name: 'due_date', nullable: true })
  dueDate!: Date | null;

  @Column({ type: 'timestamp', name: 'first_response_at', nullable: true })
  firstResponseAt!: Date | null;

  // Satisfaction
  @Column({ type: 'int', name: 'satisfaction_rating', nullable: true })
  satisfactionRating!: number | null;

  @Column({ type: 'text', name: 'satisfaction_comment', nullable: true })
  satisfactionComment!: string | null;

  // Métadonnées
  @Column({
    type: 'varchar',
    length: 20,
    default: 'portal',
  })
  source!: TicketSource;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => HrTicketComment, (comment) => comment.ticket)
  comments!: HrTicketComment[];
}
