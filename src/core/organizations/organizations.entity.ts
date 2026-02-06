import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'core', name: 'organizations' })
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'parent_org_id', nullable: true })
  parentOrgId!: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'parent_org_id' })
  parentOrg?: Organization | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 50, name: 'name_code', nullable: true })
  nameCode!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'official_name', nullable: true })
  officialName!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'registration_number', nullable: true })
  registrationNumber!: string | null;

  @Column({ type: 'varchar', length: 100 })
  country!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'postal_code', nullable: true })
  postalCode!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website!: string | null;

  @Column({ type: 'varchar', length: 3, default: 'XOF' })
  currency!: string;

  @Column({ type: 'varchar', length: 50, default: 'Africa/Lome' })
  timezone!: string;

  @Column({ type: 'varchar', length: 10, default: 'fr' })
  language!: string;

  @Column({ type: 'date', name: 'fiscal_year_start', nullable: true })
  fiscalYearStart!: Date | null;

  @Column({ type: 'date', name: 'fiscal_year_end', nullable: true })
  fiscalYearEnd!: Date | null;

  @Column({ type: 'boolean', name: 'is_root_organization', default: false })
  isRootOrganization!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 20, name: 'isolation_level', default: 'full' })
  isolationLevel!: string;

  @Column({ type: 'jsonb' })
  settings!: unknown;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
