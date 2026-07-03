import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../../organizations/organizations.entity';
import { User } from '../../users/user.entity';
import { Employee } from '../../hr/employee.entity';
import { Course } from './course.entity';
import { CourseSession } from './course-session.entity';

export type EnrollmentStatus =
  | 'invited'
  | 'enrolled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'failed';

@Index('idx_enrollments_course', ['courseId'])
@Index('idx_enrollments_employee', ['employeeId'])
@Index('idx_enrollments_user', ['userId'])
@Index('idx_enrollments_org_status', ['organizationId', 'status'])
@Entity({ schema: 'module_e_academy', name: 'course_enrollments' })
export class CourseEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'uuid', name: 'course_id', nullable: true })
  courseId!: string | null;

  @ManyToOne(() => Course, { nullable: true })
  @JoinColumn({ name: 'course_id' })
  course?: Course | null;

  @Column({ type: 'uuid', name: 'session_id', nullable: true })
  sessionId!: string | null;

  @ManyToOne(() => CourseSession, { nullable: true })
  @JoinColumn({ name: 'session_id' })
  session?: CourseSession | null;

  // Soit employee_id (apprenant interne), soit user_id (apprenant public).
  // L'invariant XOR est garanti par le CHECK SQL `chk_enrollments_learner_required`.
  @Column({ type: 'uuid', name: 'employee_id', nullable: true })
  employeeId!: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employee_id' })
  employee?: Employee | null;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @CreateDateColumn({ type: 'timestamp', name: 'enrollment_date' })
  enrollmentDate!: Date;

  @Column({ type: 'uuid', name: 'enrolled_by', nullable: true })
  enrolledBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'enrolled_by' })
  enroller?: User | null;

  @Column({ type: 'varchar', length: 50, default: 'enrolled' })
  status!: EnrollmentStatus;

  @Column({ type: 'timestamp', name: 'last_access_at', nullable: true })
  lastAccessAt!: Date | null;

  @Column({ type: 'timestamp', name: 'completion_date', nullable: true })
  completionDate!: Date | null;

  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true, select: false })
  deletedAt!: Date | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true, select: false })
  createdBy!: string | null;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true, select: false })
  updatedBy!: string | null;
}
