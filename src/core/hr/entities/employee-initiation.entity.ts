import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../employee.entity';

export enum InitiationStep {
  MANIFESTO_SENT = 'manifesto_sent',
  QUIZ_COMPLETED = 'quiz_completed',
  SPONSOR_ASSIGNED = 'sponsor_assigned',
  TEAM_PRESENTATION = 'team_presentation',
  OATH_SIGNED = 'oath_signed',
  IDENTITY_ELEMENT = 'identity_element',
}

export enum InitiationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity({ schema: 'module_c_rh', name: 'employee_initiations' })
export class EmployeeInitiation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @OneToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({
    type: 'enum',
    enum: InitiationStatus,
    default: InitiationStatus.PENDING,
  })
  status!: InitiationStatus;

  // Step 1: Manifeste LiveYDream
  @Column({ type: 'boolean', name: 'manifesto_sent', default: false })
  manifestoSent!: boolean;

  @Column({ type: 'timestamp', name: 'manifesto_sent_at', nullable: true })
  manifestoSentAt!: Date | null;

  // Step 2: Quiz 10 Commandements
  @Column({ type: 'boolean', name: 'quiz_completed', default: false })
  quizCompleted!: boolean;

  @Column({ type: 'int', name: 'quiz_score', nullable: true })
  quizScore!: number | null;

  @Column({ type: 'timestamp', name: 'quiz_completed_at', nullable: true })
  quizCompletedAt!: Date | null;

  @Column({ type: 'int', name: 'quiz_attempts', default: 0 })
  quizAttempts!: number;

  // Step 3: Parrain/Marraine
  @Column({ type: 'uuid', name: 'sponsor_id', nullable: true })
  sponsorId!: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'sponsor_id' })
  sponsor?: Employee | null;

  @Column({ type: 'timestamp', name: 'sponsor_assigned_at', nullable: true })
  sponsorAssignedAt!: Date | null;

  // Step 4: Présentation équipe
  @Column({ type: 'boolean', name: 'team_presentation_done', default: false })
  teamPresentationDone!: boolean;

  @Column({ type: 'timestamp', name: 'team_presentation_at', nullable: true })
  teamPresentationAt!: Date | null;

  // Step 5: Serment entrée
  @Column({ type: 'boolean', name: 'oath_signed', default: false })
  oathSigned!: boolean;

  @Column({ type: 'timestamp', name: 'oath_signed_at', nullable: true })
  oathSignedAt!: Date | null;

  @Column({ type: 'text', name: 'oath_document_url', nullable: true })
  oathDocumentUrl!: string | null;

  // Step 6: Élément identité LiveYDream
  @Column({ type: 'boolean', name: 'identity_element_received', default: false })
  identityElementReceived!: boolean;

  @Column({ type: 'timestamp', name: 'identity_element_at', nullable: true })
  identityElementAt!: Date | null;

  @Column({ type: 'text', name: 'identity_element_notes', nullable: true })
  identityElementNotes!: string | null;

  // Progress tracking
  @Column({ type: 'int', name: 'current_step', default: 0 })
  currentStep!: number;

  @Column({ type: 'int', name: 'total_steps', default: 6 })
  totalSteps!: number;

  @Column({ type: 'timestamp', name: 'started_at', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
