import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { JobPosition } from './job-position.entity';

/**
 * Affectation d'un poste a un collaborateur.
 *
 * Un collaborateur peut occuper plusieurs postes a la fois. Retirer un poste
 * renseigne `endedAt` au lieu de supprimer la ligne : l'historique complet des
 * postes occupes reste consultable, y compris apres un depart.
 */
@Entity({ schema: 'module_c_rh', name: 'employee_positions' })
export class EmployeePosition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @Column({ type: 'uuid', name: 'position_id' })
  positionId!: string;

  @ManyToOne(() => JobPosition)
  @JoinColumn({ name: 'position_id' })
  position?: JobPosition;

  @Column({ type: 'boolean', name: 'is_primary', default: false })
  isPrimary!: boolean;

  @Column({ type: 'timestamptz', name: 'started_at' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', name: 'ended_at', nullable: true })
  endedAt!: Date | null;

  @Column({ type: 'uuid', name: 'assigned_by', nullable: true })
  assignedBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
