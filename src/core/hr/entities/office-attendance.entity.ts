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
import { Employee } from '../employee.entity';
import { User } from '../../users/user.entity';

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'early_leave' | 'partial';

@Entity({ schema: 'module_c_rh', name: 'office_attendances' })
export class OfficeAttendance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'date', name: 'attendance_date' })
  attendanceDate!: Date;

  // Horaires planifiés
  @Column({ type: 'time', name: 'scheduled_check_in', nullable: true })
  scheduledCheckIn!: string | null;

  @Column({ type: 'time', name: 'scheduled_check_out', nullable: true })
  scheduledCheckOut!: string | null;

  // Horaires réels
  @Column({ type: 'time', name: 'actual_check_in', nullable: true })
  actualCheckIn!: string | null;

  @Column({ type: 'time', name: 'actual_check_out', nullable: true })
  actualCheckOut!: string | null;

  // Calcul
  @Column({
    type: 'decimal',
    transformer: numericTransformer,
    precision: 4,
    scale: 2,
    name: 'scheduled_hours',
    nullable: true,
  })
  scheduledHours!: number | null;

  @Column({
    type: 'decimal',
    transformer: numericTransformer,
    precision: 4,
    scale: 2,
    name: 'actual_hours',
    nullable: true,
  })
  actualHours!: number | null;

  // Statut
  @Column({
    type: 'varchar',
    length: 20,
    default: 'present',
  })
  status!: AttendanceStatus;

  // Justification
  @Column({ type: 'boolean', name: 'is_justified', default: false })
  isJustified!: boolean;

  // BIS-2 : true si actual_check_out a été déclaré a posteriori
  // (oubli de pointage complété par l'employé le lendemain).
  @Column({ type: 'boolean', name: 'is_estimated_checkout', default: false })
  isEstimatedCheckout!: boolean;

  @Column({ type: 'text', name: 'justification_notes', nullable: true })
  justificationNotes!: string | null;

  @Column({ type: 'text', name: 'justification_document_url', nullable: true })
  justificationDocumentUrl!: string | null;

  // Validation
  @Column({ type: 'uuid', name: 'validated_by', nullable: true })
  validatedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'validated_by' })
  validator?: User | null;

  @Column({ type: 'timestamp', name: 'validated_at', nullable: true })
  validatedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 10, scale: 7, name: 'check_in_latitude', nullable: true })
  checkInLatitude!: number | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 10, scale: 7, name: 'check_in_longitude', nullable: true })
  checkInLongitude!: number | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 10, scale: 7, name: 'check_out_latitude', nullable: true })
  checkOutLatitude!: number | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 10, scale: 7, name: 'check_out_longitude', nullable: true })
  checkOutLongitude!: number | null;

  @Column({ type: 'boolean', name: 'is_in_zone', default: true })
  isInZone!: boolean;

  @Column({ type: 'text', name: 'off_site_location', nullable: true })
  offSiteLocation!: string | null;

  @Column({ type: 'text', name: 'off_site_reason', nullable: true })
  offSiteReason!: string | null;

  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
