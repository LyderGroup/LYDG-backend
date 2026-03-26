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
import { Training } from './training.entity';

export type EnrollmentStatus =
  | 'interested'
  | 'registered'
  | 'waitlisted'
  | 'attended'
  | 'completed'
  | 'cancelled';

@Entity({ schema: 'module_c_rh', name: 'training_enrollments' })
export class TrainingEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'training_id' })
  trainingId!: string;

  @ManyToOne(() => Training, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'training_id' })
  training!: Training;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'enrollment_status',
    default: 'registered',
  })
  enrollmentStatus!: EnrollmentStatus;

  @Column({ type: 'timestamp', name: 'enrollment_date', default: () => 'CURRENT_TIMESTAMP' })
  enrollmentDate!: Date;

  @Column({ type: 'int', nullable: true })
  rating!: number | null;

  @Column({ type: 'text', nullable: true })
  feedback!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
