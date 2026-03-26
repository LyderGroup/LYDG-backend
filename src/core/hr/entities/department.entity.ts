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
import { User } from '../../users/user.entity';

@Entity({ schema: 'module_c_rh', name: 'departments' })
export class HrDepartment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'uuid', name: 'parent_department_id', nullable: true })
  parentDepartmentId!: string | null;

  @ManyToOne(() => HrDepartment, { nullable: true })
  @JoinColumn({ name: 'parent_department_id' })
  parentDepartment?: HrDepartment | null;

  @OneToMany(() => HrDepartment, (dept) => dept.parentDepartment)
  children?: HrDepartment[];

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'uuid', name: 'manager_id', nullable: true })
  managerId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'manager_id' })
  manager?: User | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'cost_center', nullable: true })
  costCenter!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
