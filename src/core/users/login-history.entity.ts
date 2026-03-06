import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ schema: 'core', name: 'login_history' })
export class LoginHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'inet', name: 'ip_address', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 500, name: 'user_agent', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'device_type', nullable: true })
  deviceType!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'browser', nullable: true })
  browser!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'os', nullable: true })
  os!: string | null;

  @Column({ type: 'varchar', length: 10, name: 'login_status', default: 'success' })
  loginStatus!: string;

  @Column({ type: 'varchar', length: 255, name: 'failure_reason', nullable: true })
  failureReason!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'login_at' })
  loginAt!: Date;
}
