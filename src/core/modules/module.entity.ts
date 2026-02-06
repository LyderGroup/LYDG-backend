import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'core', name: 'modules' })
export class CoreModule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'parent_module_id', nullable: true })
  parentModuleId!: string | null;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 20, default: '1.0.0' })
  version!: string;

  @Column({ type: 'varchar', length: 50, name: 'schema_name' })
  schemaName!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status!: string | null;

  @Column({ type: 'boolean', name: 'is_core_module', default: false })
  isCoreModule!: boolean;

  @Column({ type: 'boolean', name: 'is_system_module', default: false })
  isSystemModule!: boolean;

  @Column({ type: 'jsonb', name: 'settings_schema', default: () => "'{}'" })
  settingsSchema!: any;

  @Column({ type: 'jsonb', name: 'default_settings', default: () => "'{}'" })
  defaultSettings!: any;

  @Column({ type: 'jsonb', name: 'permissions_schema', default: () => "'[]'" })
  permissionsSchema!: any;

  @Column({ type: 'varchar', length: 255, name: 'entry_point', nullable: true })
  entryPoint!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'icon_url', nullable: true })
  iconUrl!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'documentation_url', nullable: true })
  documentationUrl!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'registered_at' })
  registeredAt!: Date;

  @Column({ type: 'timestamp', name: 'installed_at', nullable: true })
  installedAt!: Date | null;

  @Column({ type: 'timestamp', name: 'uninstalled_at', nullable: true })
  uninstalledAt!: Date | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
