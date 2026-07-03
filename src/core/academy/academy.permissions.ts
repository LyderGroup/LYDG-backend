/**
 * Permissions du module E (Academy & LMS).
 * Convention : `academy.<domaine>.<action>` cohérente avec hr.* / finance.*
 *
 * Découpage CRUD strict (read / create / update / delete) — un formateur
 * peut créer des cours sans pouvoir les modifier, un admin peut éditer
 * sans pouvoir supprimer, etc. Le `categories.delete` manquait avant et
 * réutilisait `write` ; il est désormais distinct.
 */
export const ACADEMY_PERMISSIONS = {
  // Catalogue de cours
  ACADEMY_COURSES_READ:    'academy.courses.read',
  ACADEMY_COURSES_CREATE:  'academy.courses.create',
  ACADEMY_COURSES_UPDATE:  'academy.courses.update',
  ACADEMY_COURSES_PUBLISH: 'academy.courses.publish',
  ACADEMY_COURSES_DELETE:  'academy.courses.delete',

  // Catégories
  ACADEMY_CATEGORIES_READ:   'academy.categories.read',
  ACADEMY_CATEGORIES_CREATE: 'academy.categories.create',
  ACADEMY_CATEGORIES_UPDATE: 'academy.categories.update',
  ACADEMY_CATEGORIES_DELETE: 'academy.categories.delete',

  // Inscriptions
  ACADEMY_ENROLLMENTS_READ_OWN: 'academy.enrollments.read.own',
  ACADEMY_ENROLLMENTS_READ:     'academy.enrollments.read',
  ACADEMY_ENROLLMENTS_CREATE:   'academy.enrollments.create',
  ACADEMY_ENROLLMENTS_UPDATE:   'academy.enrollments.update',
  ACADEMY_ENROLLMENTS_MANAGE:   'academy.enrollments.manage',

  // Sessions (ex-Formations RH)
  ACADEMY_SESSIONS_READ:   'academy.sessions.read',
  ACADEMY_SESSIONS_CREATE: 'academy.sessions.create',
  ACADEMY_SESSIONS_UPDATE: 'academy.sessions.update',
  ACADEMY_SESSIONS_DELETE: 'academy.sessions.delete',

  // Export
  ACADEMY_EXPORT: 'academy.export',
} as const;

export type AcademyPermissionCode = typeof ACADEMY_PERMISSIONS[keyof typeof ACADEMY_PERMISSIONS];

export const ACADEMY_PERMISSION_CODES: string[] = Object.values(ACADEMY_PERMISSIONS);

export const ACADEMY_MODULE_CODE = 'module_e_academy';
