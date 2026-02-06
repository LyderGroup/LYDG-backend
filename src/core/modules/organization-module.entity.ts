import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'core', name: 'organization_modules' })
export class OrganizationModule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @Column({ type: 'uuid', name: 'module_id' })
  moduleId!: string;

  @Column({ type: 'boolean', name: 'is_enabled', default: false })
  isEnabled!: boolean;

  @Column({ type: 'timestamp', name: 'enabled_at', nullable: true })
  enabledAt!: Date | null;

  @Column({ type: 'timestamp', name: 'disabled_at', nullable: true })
  disabledAt!: Date | null;

  @Column({ type: 'uuid', name: 'enabled_by', nullable: true })
  enabledBy!: string | null;

  @Column({ type: 'jsonb', name: 'settings', default: () => "'{}'" })
  settings!: any;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
