import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

@Entity({ schema: 'core', name: 'role_permissions' })
export class RolePermission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'role_id' })
  roleId!: string;

  @ManyToOne(() => Role, { nullable: false })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @Column({ type: 'uuid', name: 'permission_id' })
  permissionId!: string;

  @ManyToOne(() => Permission, { nullable: false })
  @JoinColumn({ name: 'permission_id' })
  permission!: Permission;

  @Column({ type: 'uuid', name: 'granted_by', nullable: true })
  grantedBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'granted_at' })
  grantedAt!: Date;
}
