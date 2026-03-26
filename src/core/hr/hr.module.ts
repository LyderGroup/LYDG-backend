import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './employee.entity';
import {
  // Organisation RH
  HrDepartment,
  JobPosition,
  // Congés
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  // Présence
  Attendance,
  OfficeAttendance,
  // Compétences
  Skill,
  EmployeeSkill,
  // Performance
  PerformanceReview,
  // Formation
  Training,
  TrainingEnrollment,
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
  // SAV RH
  HrTicket,
  HrTicketComment,
  HrTicketCategory,
} from './entities';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';
import {
  // Nouveaux controllers
  DepartmentController,
  JobPositionController,
  LeaveTypeController,
  LeaveRequestController,
  TrainingController,
  JobOpeningController,
  CandidateController,
  PerformanceReviewController,
  // Controllers existants
  RegulationController,
  EvaluationController,
  HrTicketController,
  AttendanceController,
} from './controllers';
import {
  // Nouveaux services
  DepartmentService,
  JobPositionService,
  LeaveTypeService,
  LeaveRequestService,
  TrainingService,
  JobOpeningService,
  CandidateService,
  PerformanceReviewService,
  // Services existants
  RegulationService,
  EvaluationService,
  HrTicketService,
  AttendanceService,
} from './services';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      // Organisation RH
      HrDepartment,
      JobPosition,
      // Congés
      LeaveType,
      LeaveBalance,
      LeaveRequest,
      // Présence
      Attendance,
      OfficeAttendance,
      // Compétences
      Skill,
      EmployeeSkill,
      // Performance
      PerformanceReview,
      // Formation
      Training,
      TrainingEnrollment,
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
      // SAV RH
      HrTicket,
      HrTicketComment,
      HrTicketCategory,
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
    TrainingController,
    JobOpeningController,
    CandidateController,
    PerformanceReviewController,
    // Controllers existants
    RegulationController,
    EvaluationController,
    HrTicketController,
    AttendanceController,
  ],
  providers: [
    HrService,
    // Nouveaux services
    DepartmentService,
    JobPositionService,
    LeaveTypeService,
    LeaveRequestService,
    TrainingService,
    JobOpeningService,
    CandidateService,
    PerformanceReviewService,
    // Services existants
    RegulationService,
    EvaluationService,
    HrTicketService,
    AttendanceService,
  ],
  exports: [
    HrService,
    // Nouveaux services
    DepartmentService,
    JobPositionService,
    LeaveTypeService,
    LeaveRequestService,
    TrainingService,
    JobOpeningService,
    CandidateService,
    PerformanceReviewService,
    // Services existants
    RegulationService,
    EvaluationService,
    HrTicketService,
    AttendanceService,
  ],
})
export class HrModule { }
