import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { HrTicket } from './hr-ticket.entity';
import { User } from '../../users/user.entity';

export type CommentAuthorType = 'EMPLOYEE' | 'HR' | 'MANAGER' | 'SYSTEM';

@Entity({ schema: 'module_c_rh', name: 'hr_ticket_comments' })
export class HrTicketComment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'ticket_id' })
  ticketId!: string;

  @ManyToOne(() => HrTicket, (ticket) => ticket.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket!: HrTicket;

  @Column({ type: 'uuid', name: 'author_id', nullable: true })
  authorId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'author_id' })
  author?: User | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'author_type',
    nullable: true,
  })
  authorType!: CommentAuthorType | null;

  @Column({ type: 'varchar', length: 255, name: 'author_name', nullable: true })
  authorName!: string | null;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'boolean', name: 'is_internal', default: false })
  isInternal!: boolean;

  // Changement de statut
  @Column({ type: 'varchar', length: 20, name: 'old_status', nullable: true })
  oldStatus!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'new_status', nullable: true })
  newStatus!: string | null;

  // Soft delete
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
