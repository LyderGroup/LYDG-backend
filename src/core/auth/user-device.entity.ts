import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organizations.entity';

/**
 * Suivi des appareils utilisés par les utilisateurs pour se connecter.
 *
 * Le `deviceFingerprint` est généré côté frontend (FingerprintJS) et envoyé
 * via le header `X-Device-Fingerprint` à chaque requête authentifiée.
 *
 * Règles métier (cf. FirebaseAuthGuard.handleDeviceCheck) :
 * - Premier login d'un user sur ce device : on insère + on notifie le RH
 *   ("nouveau device").
 * - Device déjà connu pour un autre user : on insère pour le user courant
 *   et on notifie le RH ("device partagé entre comptes").
 * - Device déjà connu pour ce user : on update lastSeenAt.
 *
 * Le user peut révoquer ses devices via DELETE /core/auth/my-devices/:id.
 */
@Entity({ schema: 'core', name: 'user_devices' })
@Index('idx_user_devices_user_fingerprint_active', ['userId', 'deviceFingerprint'], {
  unique: true,
  where: '"revoked_at" IS NULL',
})
@Index('idx_user_devices_fingerprint', ['deviceFingerprint'], {
  where: '"revoked_at" IS NULL',
})
export class UserDevice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ type: 'varchar', length: 128, name: 'device_fingerprint' })
  deviceFingerprint!: string;

  @Column({ type: 'varchar', length: 255, name: 'device_name', nullable: true })
  deviceName!: string | null;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'inet', name: 'ip_first_seen', nullable: true })
  ipFirstSeen!: string | null;

  @Column({ type: 'inet', name: 'ip_last_seen', nullable: true })
  ipLastSeen!: string | null;

  @Column({ type: 'boolean', name: 'is_trusted', default: false })
  isTrusted!: boolean;

  @Column({ type: 'timestamp', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'timestamp', name: 'first_seen_at', default: () => 'CURRENT_TIMESTAMP' })
  firstSeenAt!: Date;

  @Column({ type: 'timestamp', name: 'last_seen_at', default: () => 'CURRENT_TIMESTAMP' })
  lastSeenAt!: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
