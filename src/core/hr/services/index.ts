// Services RH existants
export { RegulationService } from './regulation.service';
export { EvaluationService } from './evaluation.service';
export { HrTicketService } from './hr-ticket.service';
export { AttendanceService } from './attendance.service';
export { GeofenceService } from './geofence.service';

// Nouveaux services RH synchronisés
export { DepartmentService } from './department.service';
export { JobPositionService } from './job-position.service';
export { LeaveTypeService } from './leave-type.service';
export { LeaveRequestService } from './leave-request.service';
export { JobOpeningService } from './job-opening.service';
export { CandidateService } from './candidate.service';
export { PerformanceReviewService } from './performance-review.service';
export { AutomaticSanctionService } from './automatic-sanction.service';
export { GuardianQuestionService } from './guardian-question.service';
export { DailyJournalService } from './daily-journal.service';
export { EmployeeInitiationService } from './employee-initiation.service';
export { CompanyRitualService } from './company-ritual.service';

// Documents RH (contrats, GDE, etc.)
export { HrDocumentService } from './hr-document.service';

// Salaires
export { SalaryService } from './salary.service';

// Événements internes (Vie interne)
export { InternalEventService } from './internal-event.service';

// Planification salaires
export { SalaryScheduleService } from './salary-schedule.service';

// Bonus
export { BonusService } from './bonus.service';

// Documents obligatoires (dossier interne)
export { RequiredDocumentsService } from '../required-documents.service';
export { DocumentReminderService } from '../document-reminder.service';

// Rappels pointage (cron)
export { AttendanceReminderService } from './attendance-reminder.service';

// Heures supplémentaires
export { OvertimeService } from './overtime.service';
