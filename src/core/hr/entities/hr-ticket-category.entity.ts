import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../../organizations/organizations.entity';
import { User } from '../../users/user.entity';

@Entity({ schema: 'module_c_rh', name: 'hr_ticket_categories' })
export class HrTicketCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // SLA
  @Column({ type: 'int', name: 'sla_hours', default: 48 })
  slaHours!: number;

  @Column({ type: 'int', name: 'sla_urgent_hours', default: 24 })
  slaUrgentHours!: number;

  // Workflow
  @Column({ type: 'uuid', name: 'auto_assign_to', nullable: true })
  autoAssignTo!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'auto_assign_to' })
  autoAssignee?: User | null;

  @Column({ type: 'boolean', name: 'requires_approval', default: false })
  requiresApproval!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'int', name: 'display_order', default: 0 })
  displayOrder!: number;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
