import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Project } from './project.entity';

@Entity({ schema: 'module_b_projects', name: 'project_members' })
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 20, name: 'role_in_project', default: 'MEMBER' })
  roleInProject!: string;

  @Column({ type: 'uuid', name: 'added_by', nullable: true })
  addedBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'joined_at' })
  joinedAt!: Date;
}
