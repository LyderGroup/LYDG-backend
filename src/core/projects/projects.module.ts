import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../organizations/organizations.entity';
import { UserRole } from '../rbac/user-role.entity';
import { RbacModule } from '../rbac/rbac.module';
import { User } from '../users/user.entity';
import { ProjectComment } from './project-comment.entity';
import { ProjectCommentsGateway } from './project-comments.gateway';
import { ProjectCommentsRealtimeService } from './project-comments.realtime';
import { ProjectMember } from './project-member.entity';
import { Project } from './project.entity';
import { Subtask } from './subtask.entity';
import { TaskComment } from './task-comment.entity';
import { Task } from './task.entity';
import { TaskCommentsGateway } from './task-comments.gateway';
import { TaskCommentsRealtimeService } from './task-comments.realtime';
import { ProjectCommentsController } from './project-comments.controller';
import { ProjectsController } from './projects.controller';
import { ProjectsLookupsController } from './projects-lookups.controller';
import { ProjectsService } from './projects.service';
import { TasksController } from './tasks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      Task,
      Subtask,
      TaskComment,
      ProjectComment,
      ProjectMember,
      UserRole,
      Organization,
      User,
    ]),
    RbacModule,
  ],
  controllers: [TasksController, ProjectsController, ProjectsLookupsController, ProjectCommentsController],
  providers: [
    ProjectsService,
    TaskCommentsGateway,
    TaskCommentsRealtimeService,
    ProjectCommentsGateway,
    ProjectCommentsRealtimeService,
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
