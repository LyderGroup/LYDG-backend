
export const HR_PERMISSIONS = {
  HR_EMPLOYEES_READ: 'hr.employees.read',
  HR_EMPLOYEES_READ_OWN: 'hr.employees.read.own',      // Voir son propre profil
  HR_EMPLOYEES_READ_TEAM: 'hr.employees.read.team',    // Voir son équipe
  HR_EMPLOYEES_READ_ALL: 'hr.employees.read.all',      // Voir tous les employés

  // Employés - Écriture
  HR_EMPLOYEES_WRITE: 'hr.employees.write',
  HR_EMPLOYEES_WRITE_OWN: 'hr.employees.write.own',    // Modifier son propre profil
  HR_EMPLOYEES_WRITE_TEAM: 'hr.employees.write.team',  // Modifier son équipe
  HR_EMPLOYEES_WRITE_ALL: 'hr.employees.write.all',    // Modifier tous les employés

  // Employés - Suppression
  HR_EMPLOYEES_DELETE: 'hr.employees.delete',
  HR_EMPLOYEES_RESTORE: 'hr.employees.restore',

  HR_SALARY_READ: 'hr.salary.read',
  HR_SALARY_READ_OWN: 'hr.salary.read.own',            // Voir son propre salaire
  HR_SALARY_READ_TEAM: 'hr.salary.read.team',          // Voir salaires de son équipe
  HR_SALARY_READ_ALL: 'hr.salary.read.all',            // Voir tous les salaires

  // Salaires - Écriture
  HR_SALARY_WRITE: 'hr.salary.write',
  HR_SALARY_WRITE_OWN: 'hr.salary.write.own',          // Demander modification (rare)
  HR_SALARY_WRITE_TEAM: 'hr.salary.write.team',        // Modifier salaires équipe
  HR_SALARY_WRITE_ALL: 'hr.salary.write.all',          // Modifier tous les salaires

  // Salaires - Export
  HR_SALARY_EXPORT: 'hr.salary.export',                // Export CSV/Excel données salariales

  // Primes
  HR_BONUS_READ: 'hr.bonus.read',
  HR_BONUS_WRITE: 'hr.bonus.write',
  HR_BONUS_APPROVE: 'hr.bonus.approve',

  HR_ORGANIZATIONS_READ: 'hr.organizations.read',
  HR_ORGANIZATIONS_READ_OWN: 'hr.organizations.read.own',    // Voir son organisation
  HR_ORGANIZATIONS_READ_ALL: 'hr.organizations.read.all',    // Voir toutes les organisations

  HR_ORGANIZATIONS_WRITE: 'hr.organizations.write',
  HR_ORGANIZATIONS_WRITE_OWN: 'hr.organizations.write.own',  // Modifier son organisation
  HR_ORGANIZATIONS_WRITE_ALL: 'hr.organizations.write.all',  // Modifier toutes les organisations

  HR_ORGANIZATIONS_CREATE: 'hr.organizations.create',
  HR_ORGANIZATIONS_DELETE: 'hr.organizations.delete',

  HR_INTERNAL_LIFE_READ: 'hr.internal-life.read',
  HR_INTERNAL_LIFE_READ_OWN: 'hr.internal-life.read.own',
  HR_INTERNAL_LIFE_READ_ALL: 'hr.internal-life.read.all',

  HR_INTERNAL_LIFE_WRITE: 'hr.internal-life.write',          // Créer événements personnalisés
  HR_INTERNAL_LIFE_MANAGE: 'hr.internal-life.manage',        // Gérer tous les événements

  HR_GUARDIAN_READ: 'hr.guardian.read',                       // Voir ses réponses
  HR_GUARDIAN_READ_ALL: 'hr.guardian.read.all',               // Voir toutes les réponses (admin)
  HR_GUARDIAN_WRITE: 'hr.guardian.write',                     // Soumettre ses réponses

  HR_JOURNAL_WRITE: 'journal.write',                          // Rédiger son journal
  HR_JOURNAL_READ_TEAM: 'journal.read_team',                  // Voir les journaux de l'équipe
  HR_JOURNAL_READ_ALL: 'journal.read_all',                    // Voir tous les journaux

  HR_ATTENDANCE_READ: 'hr.attendance.read',
  HR_ATTENDANCE_READ_OWN: 'hr.attendance.read.own',
  HR_ATTENDANCE_READ_TEAM: 'hr.attendance.read.team',
  HR_ATTENDANCE_READ_ALL: 'hr.attendance.read.all',

  HR_ATTENDANCE_WRITE: 'hr.attendance.write',                 // Pointer (check-in/out)
  HR_ATTENDANCE_JUSTIFY: 'hr.attendance.justify',             // Justifier absences
  HR_ATTENDANCE_MANAGE: 'hr.attendance.manage',               // Gérer tous les pointages

  HR_DOCUMENTS_READ: 'hr.documents.read',
  HR_DOCUMENTS_READ_OWN: 'hr.documents.read.own',
  HR_DOCUMENTS_READ_TEAM: 'hr.documents.read.team',
  HR_DOCUMENTS_READ_ALL: 'hr.documents.read.all',

  HR_DOCUMENTS_WRITE: 'hr.documents.write',
  HR_DOCUMENTS_UPLOAD: 'hr.documents.upload',
  HR_DOCUMENTS_SIGN: 'hr.documents.sign',
  HR_DOCUMENTS_DELETE: 'hr.documents.delete',

  HR_REQUIRED_DOCUMENTS_READ_OWN: 'hr.required_documents.read.own',    // Voir ses documents - PAR DÉFAUT
  HR_REQUIRED_DOCUMENTS_UPLOAD: 'hr.required_documents.upload',        // Uploader ses documents - PAR DÉFAUT
  HR_REQUIRED_DOCUMENTS_READ_ALL: 'hr.required_documents.read.all',    // Voir documents de tous - RH
  HR_REQUIRED_DOCUMENTS_VALIDATE: 'hr.required_documents.validate',    // Valider/rejeter documents - RH
  HR_REQUIRED_DOCUMENTS_MANAGE: 'hr.required_documents.manage',        // Configurer types documents - Admin RH

  HR_SANCTIONS_READ: 'hr.sanctions.read',
  HR_SANCTIONS_READ_OWN: 'hr.sanctions.read.own',
  HR_SANCTIONS_READ_ALL: 'hr.sanctions.read.all',

  HR_SANCTIONS_WRITE: 'hr.sanctions.write',
  HR_SANCTIONS_APPROVE: 'hr.sanctions.approve',

  HR_EVALUATION_READ: 'hr.evaluation.read',
  HR_EVALUATION_READ_OWN: 'hr.evaluation.read.own',
  HR_EVALUATION_READ_TEAM: 'hr.evaluation.read.team',
  HR_EVALUATION_READ_ALL: 'hr.evaluation.read.all',

  HR_EVALUATION_WRITE: 'hr.evaluation.write',
  HR_EVALUATION_VALIDATE: 'hr.evaluation.validate',

  HR_RECRUITMENT_READ: 'hr.recruitment.read',
  HR_RECRUITMENT_WRITE: 'hr.recruitment.write',
  HR_RECRUITMENT_MANAGE: 'hr.recruitment.manage',

  HR_LEAVE_READ: 'hr.leave.read',
  HR_LEAVE_READ_OWN: 'hr.leave.read.own',
  HR_LEAVE_READ_TEAM: 'hr.leave.read.team',
  HR_LEAVE_READ_ALL: 'hr.leave.read.all',

  HR_LEAVE_WRITE: 'hr.leave.write',
  HR_LEAVE_APPROVE: 'hr.leave.approve',

  HR_PERMISSIONS_MANAGE: 'hr.permissions.manage',             // Gérer les rôles et permissions RH

  // Tickets RH (SAV)
  HR_TICKET_READ_OWN: 'hr.ticket.read.own',             // Voir ses propres tickets
  HR_TICKET_READ_ALL: 'hr.ticket.read.all',             // Voir tous les tickets
  HR_TICKET_WRITE: 'hr.ticket.write',                   // Créer un ticket
  HR_TICKET_MANAGE: 'hr.ticket.manage',                 // Gérer/assigner les tickets

  HR_RITUALS_READ: 'hr.rituals.read',
  HR_RITUALS_READ_OWN: 'hr.rituals.read.own',
  HR_RITUALS_READ_ALL: 'hr.rituals.read.all',
  HR_RITUALS_WRITE: 'hr.rituals.write',
  HR_RITUALS_MANAGE: 'hr.rituals.manage',
  HR_SETTINGS_READ: 'hr.settings.read',
  HR_SETTINGS_WRITE: 'hr.settings.write',
} as const;

// Type pour les codes de permission
export type HrPermissionCode = typeof HR_PERMISSIONS[keyof typeof HR_PERMISSIONS];

// Liste de toutes les permissions RH
export const HR_PERMISSION_CODES: string[] = Object.values(HR_PERMISSIONS);

export const EMPLOYEE_BASE_PERMISSIONS: string[] = [
  HR_PERMISSIONS.HR_EMPLOYEES_READ_OWN,
  HR_PERMISSIONS.HR_EMPLOYEES_WRITE_OWN,
  HR_PERMISSIONS.HR_SALARY_READ_OWN,
  HR_PERMISSIONS.HR_GUARDIAN_READ,
  HR_PERMISSIONS.HR_GUARDIAN_WRITE,
  HR_PERMISSIONS.HR_ATTENDANCE_READ_OWN,
  HR_PERMISSIONS.HR_ATTENDANCE_WRITE,
  HR_PERMISSIONS.HR_DOCUMENTS_READ_OWN,
  HR_PERMISSIONS.HR_DOCUMENTS_SIGN,
  HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_READ_OWN,
  HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_UPLOAD,
  HR_PERMISSIONS.HR_SANCTIONS_READ_OWN,
  HR_PERMISSIONS.HR_EVALUATION_READ_OWN,
  HR_PERMISSIONS.HR_LEAVE_READ_OWN,
  HR_PERMISSIONS.HR_LEAVE_WRITE,
  HR_PERMISSIONS.HR_INTERNAL_LIFE_READ_OWN,
  HR_PERMISSIONS.HR_RITUALS_READ_OWN,
  HR_PERMISSIONS.HR_TICKET_READ_OWN,
  HR_PERMISSIONS.HR_TICKET_WRITE,
];

export const TEAM_MANAGER_PERMISSIONS: string[] = [
  ...EMPLOYEE_BASE_PERMISSIONS,
  HR_PERMISSIONS.HR_EMPLOYEES_READ_TEAM,
  HR_PERMISSIONS.HR_EMPLOYEES_WRITE_TEAM,
  HR_PERMISSIONS.HR_SALARY_READ_TEAM,
  HR_PERMISSIONS.HR_ATTENDANCE_READ_TEAM,
  HR_PERMISSIONS.HR_LEAVE_READ_TEAM,
  HR_PERMISSIONS.HR_LEAVE_APPROVE,
  HR_PERMISSIONS.HR_EVALUATION_READ_TEAM,
  HR_PERMISSIONS.HR_EVALUATION_WRITE,
  HR_PERMISSIONS.HR_DOCUMENTS_READ_TEAM,
  HR_PERMISSIONS.HR_INTERNAL_LIFE_READ_ALL,
  HR_PERMISSIONS.HR_RITUALS_READ,
  HR_PERMISSIONS.HR_RITUALS_MANAGE,
];

export const HR_ASSISTANT_PERMISSIONS: string[] = [
  HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL,
  HR_PERMISSIONS.HR_EMPLOYEES_WRITE,
  HR_PERMISSIONS.HR_SALARY_READ_ALL,
  HR_PERMISSIONS.HR_ATTENDANCE_READ_ALL,
  HR_PERMISSIONS.HR_ATTENDANCE_JUSTIFY,
  HR_PERMISSIONS.HR_DOCUMENTS_READ_ALL,
  HR_PERMISSIONS.HR_DOCUMENTS_WRITE,
  HR_PERMISSIONS.HR_DOCUMENTS_UPLOAD,
  HR_PERMISSIONS.HR_LEAVE_READ_ALL,
  HR_PERMISSIONS.HR_LEAVE_APPROVE,
  HR_PERMISSIONS.HR_RECRUITMENT_READ,
  HR_PERMISSIONS.HR_GUARDIAN_READ_ALL,
  HR_PERMISSIONS.HR_INTERNAL_LIFE_READ_ALL,
  HR_PERMISSIONS.HR_INTERNAL_LIFE_WRITE,
  HR_PERMISSIONS.HR_RITUALS_READ,
  HR_PERMISSIONS.HR_RITUALS_WRITE,
  HR_PERMISSIONS.HR_TICKET_READ_ALL,
  HR_PERMISSIONS.HR_TICKET_MANAGE,
];

/**
 * Permissions pour un manager RH
 */
export const HR_MANAGER_PERMISSIONS: string[] = [
  ...HR_ASSISTANT_PERMISSIONS,
  HR_PERMISSIONS.HR_EMPLOYEES_DELETE,
  HR_PERMISSIONS.HR_EMPLOYEES_RESTORE,
  HR_PERMISSIONS.HR_SALARY_WRITE_ALL,
  HR_PERMISSIONS.HR_SALARY_EXPORT,
  HR_PERMISSIONS.HR_BONUS_READ,
  HR_PERMISSIONS.HR_BONUS_WRITE,
  HR_PERMISSIONS.HR_BONUS_APPROVE,
  HR_PERMISSIONS.HR_ATTENDANCE_MANAGE,
  HR_PERMISSIONS.HR_SANCTIONS_READ_ALL,
  HR_PERMISSIONS.HR_SANCTIONS_WRITE,
  HR_PERMISSIONS.HR_EVALUATION_READ_ALL,
  HR_PERMISSIONS.HR_EVALUATION_VALIDATE,
  HR_PERMISSIONS.HR_RECRUITMENT_WRITE,
  HR_PERMISSIONS.HR_RECRUITMENT_MANAGE,
  HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_MANAGE,
  HR_PERMISSIONS.HR_ORGANIZATIONS_READ_OWN,
  HR_PERMISSIONS.HR_ORGANIZATIONS_WRITE_OWN,
  HR_PERMISSIONS.HR_INTERNAL_LIFE_MANAGE,
  HR_PERMISSIONS.HR_RITUALS_READ_ALL,
  HR_PERMISSIONS.HR_RITUALS_MANAGE,
  HR_PERMISSIONS.HR_SETTINGS_READ,
];

/**
 * Permissions pour un admin d'organisation
 */
export const ORG_ADMIN_PERMISSIONS: string[] = [
  ...HR_MANAGER_PERMISSIONS,
  HR_PERMISSIONS.HR_ORGANIZATIONS_READ_ALL,
  HR_PERMISSIONS.HR_ORGANIZATIONS_WRITE_ALL,
  HR_PERMISSIONS.HR_ORGANIZATIONS_CREATE,
  HR_PERMISSIONS.HR_PERMISSIONS_MANAGE,
  HR_PERMISSIONS.HR_SETTINGS_WRITE,
];

export const SUPER_ADMIN_PERMISSIONS: string[] = [
  ...HR_PERMISSION_CODES, // Toutes les permissions
];
