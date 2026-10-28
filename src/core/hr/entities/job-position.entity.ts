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
// core.departments : la table de reference, celle que gere l'administration
// (migration 2026-10-22). L'ancienne liaison pointait sur module_c_rh.departments.
import { Department } from '../../departments/department.entity';

import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
@Entity({ schema: 'module_c_rh', name: 'job_positions' })
export class JobPosition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'uuid', name: 'department_id', nullable: true })
  departmentId!: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department?: Department | null;

  /** Libelle court affiche dans les listes (ex. « CM »). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  /** Cahier des charges du poste. */
  @Column({ type: 'text', nullable: true })
  responsibilities!: string | null;

  @Column({ type: 'boolean', name: 'is_team_lead', default: false })
  isTeamLead!: boolean;

  @Column({ type: 'boolean', name: 'is_department_head', default: false })
  isDepartmentHead!: boolean;

  @Column({ type: 'boolean', name: 'is_project_lead', default: false })
  isProjectLead!: boolean;

  /**
   * Poste de DRH : son titulaire devient automatiquement le « Manager RH »
   * de tous les collaborateurs de la filiale.
   */
  @Column({ type: 'boolean', name: 'is_hr_director', default: false })
  isHrDirector!: boolean;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'job_family', nullable: true })
  jobFamily!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'job_level', nullable: true })
  jobLevel!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'salary_grade', nullable: true })
  salaryGrade!: string | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 15, scale: 2, name: 'min_salary', nullable: true })
  minSalary!: number | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 15, scale: 2, name: 'max_salary', nullable: true })
  maxSalary!: number | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
