import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from '../employee.entity';
import { User } from '../../users/user.entity';

export type SalaryChangeType = 'HIRED' | 'RAISE' | 'PROMOTION' | 'ADJUSTMENT' | 'DECREASE';

@Entity({ schema: 'module_c_rh', name: 'employee_salary_history' })
export class EmployeeSalaryHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  // le colone des salaires
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'base_salary' })
  baseSalary!: number;

  @Column({ type: 'varchar', length: 3, default: 'XOF' })
  currency!: string;

  // pour les composants active
  @Column({ type: 'jsonb', default: [] })
  components!: Array<{ componentId: string; amount: number }>;

  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'total_fixed', nullable: true })
  totalFixed!: number | null;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    name: 'max_performance_bonus',
    nullable: true,
  })
  maxPerformanceBonus!: number | null;

  // Période de validité
  @Column({ type: 'date', name: 'valid_from' })
  validFrom!: Date;

  @Column({ type: 'date', name: 'valid_to', nullable: true })
  validTo!: Date | null;

  // Historique
  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'previous_salary', nullable: true })
  previousSalary!: number | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'change_type',
    nullable: true,
  })
  changeType!: SalaryChangeType | null;

  @Column({ type: 'text', name: 'change_reason', nullable: true })
  changeReason!: string | null;

  @Column({ type: 'uuid', name: 'changed_by', nullable: true })
  changedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'changed_by' })
  changer?: User | null;
 
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date; 
}
