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
import { User } from '../../users/user.entity';
import { CourseCategory } from './course-category.entity';
import { numericTransformer } from '../../../common/typeorm/numeric-transformer';

export type CourseStatus = 'draft' | 'published' | 'archived';

@Index('idx_courses_org_status', ['organizationId', 'status'])
@Index('uq_courses_org_code', ['organizationId', 'code'], { unique: true })
@Entity({ schema: 'module_e_academy', name: 'courses' })
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'uuid', name: 'category_id', nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => CourseCategory, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: CourseCategory | null;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'fr' })
  language!: string;

  @Column({ type: 'varchar', length: 50, name: 'difficulty_level', nullable: true })
  difficultyLevel!: string | null;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
    name: 'duration_hours',
    nullable: true,
  })
  durationHours!: number | null;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status!: CourseStatus;

  @Column({ type: 'uuid', name: 'owner_id', nullable: true })
  ownerId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner?: User | null;

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
