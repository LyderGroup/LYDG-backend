import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/organizations.entity';
import { User } from '../../users/user.entity';

export type InternalEventType = 
  | 'MEETING' 
  | 'TRAINING' 
  | 'CELEBRATION' 
  | 'ANNOUNCEMENT' 
  | 'TEAM_BUILDING'
  | 'BIRTHDAY'
  | 'WORK_ANNIVERSARY'
  | 'HOLIDAY'
  | 'OTHER';

export type InternalEventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

@Entity({ schema: 'module_c_rh', name: 'internal_events' })
export class InternalEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'event_type',
  })
  eventType!: InternalEventType;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'DRAFT',
  })
  status!: InternalEventStatus;

  // Dates
  @Column({ type: 'timestamp', name: 'start_date' })
  startDate!: Date;

  @Column({ type: 'timestamp', name: 'end_date' })
  endDate!: Date;

  @Column({ type: 'boolean', name: 'is_all_day', default: false })
  isAllDay!: boolean;

  // Location
  @Column({ type: 'varchar', length: 255, nullable: true })
  location!: string | null;

  @Column({ type: 'boolean', name: 'is_remote', default: false })
  isRemote!: boolean;

  // Organisateur
  @Column({ type: 'uuid', name: 'organizer_id', nullable: true })
  organizerId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'organizer_id' })
  organizer?: User | null;

  // Participants
  @Column({ type: 'jsonb', name: 'target_departments', default: [] })
  targetDepartments!: string[];

  @Column({ type: 'jsonb', name: 'target_employee_ids', default: [] })
  targetEmployeeIds!: string[];

  @Column({ type: 'boolean', name: 'is_company_wide', default: true })
  isCompanyWide!: boolean;

  // Recurrence
  @Column({ type: 'varchar', length: 20, name: 'recurrence_type', nullable: true })
  recurrenceType!: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | null;

  @Column({ type: 'date', name: 'recurrence_end_date', nullable: true })
  recurrenceEndDate!: Date | null;

  // Visibility
  @Column({ type: 'boolean', name: 'is_visible', default: true })
  isVisible!: boolean;

  @Column({ type: 'boolean', name: 'requires_rsvp', default: false })
  requiresRsvp!: boolean;

  // Attachments
  @Column({ type: 'jsonb', name: 'attachments', default: [] })
  attachments!: Array<{ name: string; url: string; type: string }>;

  // Color for calendar display
  @Column({ type: 'varchar', length: 7, default: '#F09815' })
  color!: string;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
