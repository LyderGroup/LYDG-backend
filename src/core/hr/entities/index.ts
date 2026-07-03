// Organisation RH
export { HrDepartment } from './department.entity';
export { JobPosition } from './job-position.entity';

// Congés
export { LeaveType } from './leave-type.entity';
export { LeaveBalance } from './leave-balance.entity';
export { LeaveRequest } from './leave-request.entity';
export { LeaveDeductionHistory } from './leave-deduction-history.entity';
export type { DeductionRecordType, DeductionAbsenceType } from './leave-deduction-history.entity';

// Présence
export { Attendance } from './attendance.entity';
export { OfficeAttendance } from './office-attendance.entity';

// Compétences
export { Skill } from './skill.entity';
export { EmployeeSkill } from './employee-skill.entity';

// Performance
export { PerformanceReview } from './performance-review.entity';

// Recrutement
export { JobOpening } from './job-opening.entity';
export { Candidate } from './candidate.entity';
export { JobApplication } from './job-application.entity';

// Règlements et signatures
export { InternalRegulation } from './internal-regulation.entity';
export { RegulationDocument } from './regulation-document.entity';
export { EmployeeRegulationAssignment } from './employee-regulation-assignment.entity';
export { ElectronicSignature } from './electronic-signature.entity';

// Documents RH (contrats, GDE, etc.)
export { HrDocument } from './hr-document.entity';
export type { HrDocumentType, HrDocumentStatus, HrDocumentAction } from './hr-document.entity';
export { HrDocumentAssignment } from './hr-document-assignment.entity';
export type { HrAssignmentStatus } from './hr-document-assignment.entity';
export { HrDocumentTypeConfig } from './hr-document-type.entity';
export type { HrDocumentDefaultAction } from './hr-document-type.entity';

// KPIs et évaluations
export { Kpi } from './kpi.entity';
export { KpiWeight } from './kpi-weight.entity';
export { MonthlyEvaluation } from './monthly-evaluation.entity';
export { EvaluationKpiScore } from './evaluation-kpi-score.entity';

// Rémunération
export { SalaryComponent } from './salary-component.entity';
export { EmployeeSalaryHistory } from './employee-salary-history.entity';
export { BonusType } from './bonus-type.entity';
export { EmployeeBonus } from './employee-bonus.entity';

// Sanctions
export { EmployeeSanction } from './employee-sanction.entity';

export { GuardianQuestion } from './guardian-question.entity';

// Journal de bord
export { DailyJournal } from './daily-journal.entity';

export { EmployeeInitiation, InitiationStatus, InitiationStep } from './employee-initiation.entity';

// SAV RH
export { HrTicket } from './hr-ticket.entity';
export { HrTicketComment } from './hr-ticket-comment.entity';
export { HrTicketCategory } from './hr-ticket-category.entity';

// Rituels d'entreprise
export { CompanyRitual, RitualOccurrence, RitualParticipant, RitualType, RitualStatus } from './company-ritual.entity';

// Geofencing
export { GeofenceZone } from './geofence-zone.entity';

// Événements internes (Vie interne)
export { InternalEvent } from './internal-event.entity';
export type { InternalEventType, InternalEventStatus } from './internal-event.entity';

// Planification salaires
export { SalarySchedule, SalaryPayment } from './salary-schedule.entity';
export type { SalaryFrequency, PaymentStatus } from './salary-schedule.entity';

// Documents obligatoires (dossier interne)
export { EmployeeRequiredDocument } from '../employee-required-document.entity';