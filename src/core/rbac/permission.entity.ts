import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RolePermission } from './role-permission.entity';

@Entity({ schema: 'core', name: 'permissions' })
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, name: 'system_module_code', nullable: true })
  systemModuleCode!: string | null;

  @Column({ type: 'varchar', length: 100 })
  resource!: string;

  @Column({ type: 'varchar', length: 50 })
  action!: string;

  @Column({ type: 'varchar', length: 255, name: 'display_name', nullable: true })
  displayName!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', name: 'is_crud_action', default: true })
  isCrudAction!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.permission)
  rolePermissions?: RolePermission[];
}
