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
import { Skill } from './skill.entity';
import { User } from '../../users/user.entity';

@Entity({ schema: 'module_c_rh', name: 'employee_skills' })
export class EmployeeSkill {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'uuid', name: 'skill_id' })
  skillId!: string;

  @ManyToOne(() => Skill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skill_id' })
  skill!: Skill;

  @Column({ type: 'int', name: 'proficiency_level', nullable: true })
  proficiencyLevel!: number | null;

  @Column({ type: 'uuid', name: 'verified_by', nullable: true })
  verifiedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'verified_by' })
  verifier?: User | null;

  @Column({ type: 'timestamp', name: 'verified_at', nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: 'int', name: 'years_of_experience', nullable: true })
  yearsOfExperience!: number | null;

  @Column({ type: 'boolean', name: 'self_assessed', default: true })
  selfAssessed!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
