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
import { Employee } from '../employee.entity';

export enum RitualType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

export enum RitualStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity({ schema: 'module_c_rh', name: 'company_rituals' })
export class CompanyRitual {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: RitualType, name: 'ritual_type' })
  ritualType!: RitualType;

  @Column({ type: 'time', name: 'scheduled_time', nullable: true })
  scheduledTime!: string | null; // e.g., "08:30" for morning standup

  @Column({ type: 'int', name: 'day_of_week', nullable: true })
  dayOfWeek!: number | null; // 0-6 for weekly rituals

  @Column({ type: 'int', name: 'day_of_month', nullable: true })
  dayOfMonth!: number | null; // 1-31 for monthly rituals

  @Column({ type: 'int', name: 'duration_minutes', default: 15 })
  durationMinutes!: number;

  @Column({ type: 'text', name: 'participant_roles', nullable: true })
  participantRoles!: string | null; // JSON array of roles

  @Column({ type: 'text', name: 'checklist_items', nullable: true })
  checklistItems!: string | null; // JSON array of checklist items

  @Column({ type: 'boolean', name: 'is_mandatory', default: true })
  isMandatory!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @OneToMany('RitualOccurrence', 'ritual')
  occurrences!: any[];

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}

@Entity({ schema: 'module_c_rh', name: 'ritual_occurrences' })
export class RitualOccurrence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'ritual_id' })
  ritualId!: string;

  @ManyToOne(() => CompanyRitual, (r) => r.occurrences)
  @JoinColumn({ name: 'ritual_id' })
  ritual!: CompanyRitual;

  @Column({ type: 'date', name: 'occurrence_date' })
  occurrenceDate!: Date;

  @Column({ type: 'time', name: 'actual_start_time', nullable: true })
  actualStartTime!: string | null;

  @Column({ type: 'time', name: 'actual_end_time', nullable: true })
  actualEndTime!: string | null;

  @Column({ type: 'enum', enum: RitualStatus })
  status!: RitualStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'text', name: 'attendees', nullable: true })
  attendees!: string | null; // JSON array of employee IDs

  @Column({ type: 'text', name: 'absentees', nullable: true })
  absentees!: string | null; // JSON array of employee IDs

  @OneToMany('RitualParticipant', 'occurrence')
  participants!: any[];

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}

@Entity({ schema: 'module_c_rh', name: 'ritual_participants' })
export class RitualParticipant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'occurrence_id' })
  occurrenceId!: string;

  @ManyToOne(() => RitualOccurrence, (o) => o.participants)
  @JoinColumn({ name: 'occurrence_id' })
  occurrence!: RitualOccurrence;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'boolean', name: 'is_present', default: false })
  isPresent!: boolean;

  @Column({ type: 'text', nullable: true })
  contribution!: string | null; // What they shared/contributed

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
