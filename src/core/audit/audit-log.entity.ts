import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'SOFT_DELETE'
  | 'RESTORE'
  | 'HARD_DELETE'
  | 'READ_SENSITIVE'
  | 'LOCK'
  | 'UNLOCK'
  | 'LOGIN'
  | 'LOGOUT'
  | 'EXPORT';

@Entity({ schema: 'core', name: 'audit_logs' })
@Index(['organizationId', 'entityType', 'entityId', 'occurredAt'])
@Index(['actorUserId', 'occurredAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'occurred_at' })
  occurredAt!: Date;

  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'inet', name: 'actor_ip', nullable: true })
  actorIp!: string | null;

  @Column({ type: 'text', name: 'actor_user_agent', nullable: true })
  actorUserAgent!: string | null;

  @Column({ type: 'varchar', length: 64, name: 'request_id', nullable: true })
  requestId!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'entity_type' })
  entityType!: string;

  @Column({ type: 'uuid', name: 'entity_id' })
  entityId!: string;

  @Column({ type: 'varchar', length: 30 })
  action!: AuditAction;

  @Column({ type: 'jsonb', name: 'before_state', nullable: true })
  beforeState!: Record<string, any> | null;

  @Column({ type: 'jsonb', name: 'after_state', nullable: true })
  afterState!: Record<string, any> | null;

  @Column({ type: 'text', array: true, name: 'changed_fields', nullable: true })
  changedFields!: string[] | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @Column({ type: 'boolean', name: 'is_legally_significant', default: false })
  isLegallySignificant!: boolean;

  @Column({ type: 'date', name: 'retention_until', nullable: true })
  retentionUntil!: Date | null;
}
