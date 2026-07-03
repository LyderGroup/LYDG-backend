import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Employee } from './employee.entity';
import { EmployeeProfile } from './employee-profile.entity';
import { Department } from '../departments/department.entity';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organizations.entity';
import {
  HrDepartment,
  JobPosition,
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  LeaveDeductionHistory,
  Attendance,
  OfficeAttendance,
  Skill,
  EmployeeSkill,
  PerformanceReview,
  JobOpening,
  Candidate,
  JobApplication,
  InternalRegulation,
  RegulationDocument,
  EmployeeRegulationAssignment,
  ElectronicSignature,
  HrDocument,
  HrDocumentAssignment,
  HrDocumentTypeConfig,
  Kpi,
  KpiWeight,
  MonthlyEvaluation,
  EvaluationKpiScore,
  // Rémunération
  SalaryComponent,
  EmployeeSalaryHistory,
  BonusType,
  EmployeeBonus,
  // Sanctions
  EmployeeSanction,
  // Questions Gardien
  GuardianQuestion,
  // Journal de bord
  DailyJournal,
  // Initiation nouveaux membres
  EmployeeInitiation,
  // SAV RH
  HrTicket,
  HrTicketComment,
  HrTicketCategory,
  // Rituels d'entreprise
  CompanyRitual,
  RitualOccurrence,
  RitualParticipant,
  // Géofencing
  GeofenceZone,
  // Événements internes
  InternalEvent,
  // Planification salaires
  SalarySchedule,
  SalaryPayment,
  // Documents obligatoires
  EmployeeRequiredDocument,
} from './entities';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';
import {
  // Nouveaux controllers
  DepartmentController,
  JobPositionController,
  LeaveTypeController,
  LeaveRequestController,
  JobOpeningController,
  CandidateController,
  PerformanceReviewController,
  SanctionController,
  GuardianQuestionController,
  DailyJournalController,
  EmployeeInitiationController,
  // Controllers existants
  RegulationController,
  EvaluationController,
  HrTicketController,
  AttendanceController,
  // Rituels
  CompanyRitualController,
  // Géofencing
  GeofenceController,
  // Documents RH
  HrDocumentController,
  HrDocumentTypeController,
  // Salaires
  SalaryController,
  // Événements internes
  InternalEventController,
  // Planification salaires
  SalaryScheduleController,
  // Bonus
  BonusController,
  // Documents obligatoires
  RequiredDocumentsController,
} from './controllers';
import {
  // Nouveaux services
  DepartmentService,
  JobPositionService,
  LeaveTypeService,
  LeaveRequestService,
  JobOpeningService,
  CandidateService,
  PerformanceReviewService,
  AutomaticSanctionService,
  GuardianQuestionService,
  DailyJournalService,
  EmployeeInitiationService,
  // Services existants
  RegulationService,
  EvaluationService,
  HrTicketService,
  AttendanceService,
  // Rituels
  CompanyRitualService,
  // Géofencing
  GeofenceService,
  // Documents RH
  HrDocumentService,
  // Salaires
  SalaryService,
  // Événements internes
  InternalEventService,
  // Planification salaires
  SalaryScheduleService,
  // Bonus
  BonusService,
  // Documents obligatoires
  RequiredDocumentsService,
  DocumentReminderService,
  // Rappels pointage
  AttendanceReminderService,
  // Heures supplémentaires
  OvertimeService,
} from './services';
import { EmployeeProfileController } from './employee-profile.controller';
import { EmployeeProfileService } from './employee-profile.service';
import { HrRealtimeService } from './hr-realtime.service';
import { MigrationController } from './migration.controller';
import { RbacModule } from '../rbac/rbac.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notifications/notification.module';
import { UsersModule } from '../users/users.module';
import { LoginHistory } from '../users/login-history.entity';
import { UserRole } from '../rbac/user-role.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthModule,
    NotificationModule,
    UsersModule,
    TypeOrmModule.forFeature([
      Employee,
      EmployeeProfile,
      Department, // Core departments for employee.department relation
      User, // For employee.user relation
      Organization, // For employee.organization relation
      LoginHistory, // For FirebaseAuthGuard
      UserRole, // For role checking in HrDocumentController
      // Organisation RH
      HrDepartment,
      JobPosition,
      // Congés
      LeaveType,
      LeaveBalance,
      LeaveRequest,
      LeaveDeductionHistory,
      // Présence
      Attendance,
      OfficeAttendance,
      // Compétences
      Skill,
      EmployeeSkill,
      // Performance
      PerformanceReview,
      // Recrutement
      JobOpening,
      Candidate,
      JobApplication,
      // Règlements et signatures
      InternalRegulation,
      RegulationDocument,
      EmployeeRegulationAssignment,
      ElectronicSignature,
      // KPIs et évaluations
      Kpi,
      KpiWeight,
      MonthlyEvaluation,
      EvaluationKpiScore,
      // Rémunération
      SalaryComponent,
      EmployeeSalaryHistory,
      BonusType,
      EmployeeBonus,
      // Sanctions
      EmployeeSanction,
      // Questions Gardien
      GuardianQuestion,
      // Journal de bord
      DailyJournal,
      // Initiation nouveaux membres
      EmployeeInitiation,
      // SAV RH
      HrTicket,
      HrTicketComment,
      HrTicketCategory,
      // Rituels d'entreprise
      CompanyRitual,
      RitualOccurrence,
      RitualParticipant,
      // Géofencing
      GeofenceZone,
      // Documents RH
      HrDocument,
      HrDocumentAssignment,
      HrDocumentTypeConfig,
      // Événements internes
      InternalEvent,
      // Planification salaires
      SalarySchedule,
      SalaryPayment,
      // Documents obligatoires
      EmployeeRequiredDocument,
    ]),
    RbacModule,
  ],
  controllers: [
    HrController,
    // Nouveaux controllers
    DepartmentController,
    JobPositionController,
    LeaveTypeController,
    LeaveRequestController,
    JobOpeningController,
    CandidateController,
    PerformanceReviewController,
    SanctionController,
    GuardianQuestionController,
    DailyJournalController,
    EmployeeInitiationController,
    // Controllers existants
    RegulationController,
    EvaluationController,
    HrTicketController,
    AttendanceController,
    // Rituels
    CompanyRitualController,
    // Géofencing
    GeofenceController,
    // Documents RH
    HrDocumentController,
    HrDocumentTypeController,
    // Salaires
    SalaryController,
    // Événements internes
    InternalEventController,
    // Planification salaires
    SalaryScheduleController,
    // Bonus
    BonusController,
    // Documents obligatoires
    RequiredDocumentsController,
    // Profil employé
    EmployeeProfileController,
    // Migrations
    MigrationController,
  ],
  providers: [
    HrService,
    // Nouveaux services
    DepartmentService,
    JobPositionService,
    LeaveTypeService,
    LeaveRequestService,
    JobOpeningService,
    CandidateService,
    PerformanceReviewService,
    AutomaticSanctionService,
    GuardianQuestionService,
    DailyJournalService,
    EmployeeInitiationService,
    // Services existants
    RegulationService,
    EvaluationService,
    HrTicketService,
    AttendanceService,
    // Rituels
    CompanyRitualService,
    // Géofencing
    GeofenceService,
    // Documents RH
    HrDocumentService,
    // Salaires
    SalaryService,
    // Événements internes
    InternalEventService,
    // Planification salaires
    SalaryScheduleService,
    // Bonus
    BonusService,
    // Documents obligatoires
    RequiredDocumentsService,
    DocumentReminderService,
    // Rappels pointage (cron)
    AttendanceReminderService,
    // Heures supplémentaires
    OvertimeService,
    // Profil employé
    EmployeeProfileService,
    // Realtime HR (Socket.IO emits)
    HrRealtimeService,
  ],
  exports: [
    HrService,
    // Nouveaux services
    DepartmentService,
    JobPositionService,
    LeaveTypeService,
    LeaveRequestService,
    JobOpeningService,
    CandidateService,
    PerformanceReviewService,
    AutomaticSanctionService,
    GuardianQuestionService,
    DailyJournalService,
    EmployeeInitiationService,
    // Services existants
    RegulationService,
    EvaluationService,
    HrTicketService,
    AttendanceService,
    // Rituels
    CompanyRitualService,
    // Géofencing
    GeofenceService,
    // Documents RH
    HrDocumentService,
    // Salaires
    SalaryService,
    // Événements internes
    InternalEventService,
    // Planification salaires
    SalaryScheduleService,
    // Bonus
    BonusService,
    // Profil employé
    EmployeeProfileService,
    // Realtime HR
    HrRealtimeService,
  ],
})
export class HrModule { }
