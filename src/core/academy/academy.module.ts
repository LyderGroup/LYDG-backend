import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RbacModule } from '../rbac/rbac.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { LoginHistory } from '../users/login-history.entity';
import { Employee } from '../hr/employee.entity';
import { Course, CourseCategory, CourseEnrollment, CourseSession } from './entities';
import {
  CourseCategoryController,
  CourseController,
  EnrollmentController,
  CourseSessionController,
  CatalogController,
  MyEnrollmentsController,
} from './controllers';
import {
  CourseCategoryService,
  CourseService,
  EnrollmentService,
  CourseSessionService,
} from './services';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    RbacModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      Course,
      CourseCategory,
      CourseEnrollment,
      CourseSession,
      Employee, // pour la résolution des employés inscrits
      LoginHistory, // requis par FirebaseAuthGuard global
    ]),
  ],
  controllers: [
    CourseController,
    CourseCategoryController,
    EnrollmentController,
    CourseSessionController,
    CatalogController,
    MyEnrollmentsController,
  ],
  providers: [
    CourseService,
    CourseCategoryService,
    EnrollmentService,
    CourseSessionService,
  ],
  exports: [CourseService, CourseCategoryService, EnrollmentService, CourseSessionService],
})
export class AcademyModule {}
