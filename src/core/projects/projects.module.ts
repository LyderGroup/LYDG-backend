import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Organization } from '../organizations/organizations.entity';
import { UserRole } from '../rbac/user-role.entity';
import { Role } from '../rbac/role.entity';
import { RbacModule } from '../rbac/rbac.module';
import { User } from '../users/user.entity';
import { NotificationModule } from '../notifications/notification.module';
import { ProjectComment } from './project-comment.entity';
import { ProjectCommentsGateway } from './project-comments.gateway';
import { ProjectCommentsRealtimeService } from './project-comments.realtime';
import { ProjectMember } from './project-member.entity';
import { Project } from './project.entity';
import { ProjectWorkflow } from './project-workflow.entity';
import { ProjectWorkflowStep } from './project-workflow-step.entity';
import { Subtask } from './subtask.entity';
import { TaskDependency } from './task-dependency.entity';
import { TaskWorkflowValidation } from './task-workflow-validation.entity';
import { ValidationRequest } from './validation-request.entity';
import { TaskComment } from './task-comment.entity';
import { Task } from './task.entity';
import { TaskCommentsGateway } from './task-comments.gateway';
import { TaskCommentsRealtimeService } from './task-comments.realtime';
import { ProjectCommentsController } from './project-comments.controller';
import { ProjectsController } from './projects.controller';
import { ProjectsLookupsController } from './projects-lookups.controller';
import { ProjectsService } from './projects.service';
import { WorkflowValidationService } from './workflow-validation.service';
import { TaskDependencyService } from './task-dependency.service';
import { TasksController } from './tasks.controller';
import { DeadlineReminderService } from './deadline-reminder.service';
import { SubtaskService } from './subtask.service';
import { ProjectCommentService } from './project-comment.service';
import { TaskCommentService } from './task-comment.service';
import { ProjectsRealtimeService } from './projects-realtime.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      Project,
      Task,
      TaskDependency,
      TaskWorkflowValidation,
      ValidationRequest,
      Subtask,
      TaskComment,
      ProjectComment,
      ProjectMember,
      ProjectWorkflow,
      ProjectWorkflowStep,
      UserRole,
      Role,
      Organization,
      User,
    ]),
    RbacModule,
    NotificationModule,
  ],
  controllers: [TasksController, ProjectsController, ProjectsLookupsController, ProjectCommentsController],
  providers: [
    ProjectsService,
    WorkflowValidationService,
    TaskDependencyService,
    TaskCommentsGateway,
    TaskCommentsRealtimeService,
    ProjectCommentsGateway,
    ProjectCommentsRealtimeService,
    DeadlineReminderService,
    SubtaskService,
    ProjectCommentService,
    TaskCommentService,
    ProjectsRealtimeService,
  ],
  exports: [
    ProjectsService,
    WorkflowValidationService,
    TaskDependencyService,
    SubtaskService,
    ProjectCommentService,
    TaskCommentService,
    ProjectsRealtimeService,
  ],
})
export class ProjectsModule { }

