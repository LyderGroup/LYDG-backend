import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/organizations.entity';

@Entity({ schema: 'core', name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  username!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'password_hash', select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 255, name: 'password_salt', nullable: true, select: false })
  passwordSalt!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'first_name' })
  firstName!: string;

  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  lastName!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender!: string | null;

  @Column({ type: 'date', name: 'birth_date', nullable: true })
  birthDate!: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'text', name: 'avatar_url', nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'boolean', name: 'is_2fa_enabled', default: false })
  is2faEnabled!: boolean;

  @Column({ type: 'varchar', length: 20, name: 'two_factor_method', nullable: true })
  twoFactorMethod!: string | null;

  @Column({ type: 'boolean', name: 'email_verified', default: false })
  emailVerified!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', name: 'is_locked', default: false })
  isLocked!: boolean;

  @Column({ type: 'timestamp', name: 'locked_until', nullable: true })
  lockedUntil!: Date | null;

  @Column({ type: 'timestamp', name: 'last_login_at', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ type: 'inet', name: 'last_login_ip', nullable: true })
  lastLoginIp!: string | null;

  @Column({ type: 'int', name: 'login_count', default: 0 })
  loginCount!: number;

  @Column({ type: 'varchar', length: 10, default: 'fr' })
  language!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  timezone!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'external_id', nullable: true })
  externalId!: string | null;

  @Column({ type: 'jsonb' })
  metadata!: unknown;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
