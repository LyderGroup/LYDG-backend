import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Role } from './role.entity';

@Entity({ schema: 'core', name: 'user_roles' })
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'role_id' })
  roleId!: string;

  @ManyToOne(() => Role, { nullable: false })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @Column({ type: 'uuid', name: 'assigned_by', nullable: true })
  assignedBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'assigned_at' })
  assignedAt!: Date;

  @Column({ type: 'timestamp', name: 'expires_at', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
