/**
 * Global Permissions
 * 
 * Permissions globales pour l'application (utilisateurs, rôles, système).
 * Convention de nommage: <domaine>:<action>
 */

// =============================================================================
// UTILISATEURS
// =============================================================================
export const USER_PERMISSIONS = {
  USER_READ: 'user.read',
  USER_READ_OWN: 'user.read.own',               // Voir son propre profil
  USER_READ_ALL: 'user.read.all',               // Voir tous les utilisateurs
  USER_WRITE: 'user.write',
  USER_WRITE_OWN: 'user.write.own',             // Modifier son propre profil
  USER_MANAGE: 'user.manage',                    // Gérer tous les utilisateurs
  USER_DELETE: 'user.delete',
  USER_IMPERSONATE: 'user.impersonate',          // Se connecter en tant qu'un autre
} as const;

// =============================================================================
// RÔLES
// =============================================================================
export const ROLE_PERMISSIONS = {
  ROLE_READ: 'role.read',
  ROLE_READ_ALL: 'role.read.all',
  ROLE_CREATE: 'role.create',
  ROLE_EDIT: 'role.edit',
  ROLE_DELETE: 'role.delete',
  ROLE_ASSIGN: 'role.assign',                    // Assigner des rôles aux utilisateurs
  ROLE_PERMISSIONS_MANAGE: 'role.permissions.manage', // Gérer les permissions des rôles
} as const;

// =============================================================================
// SYSTÈME
// =============================================================================
export const SYSTEM_PERMISSIONS = {
  SYSTEM_ADMIN: 'system.admin',                  // Accès admin complet
  SYSTEM_CONFIG: 'system.config',                // Configuration système
  SYSTEM_AUDIT: 'system.audit',                  // Logs d'audit
  SYSTEM_BACKUP: 'system.backup',                // Gestion des sauvegardes
} as const;

// =============================================================================
// EXPORTS
// =============================================================================
export const GLOBAL_PERMISSIONS = {
  ...USER_PERMISSIONS,
  ...ROLE_PERMISSIONS,
  ...SYSTEM_PERMISSIONS,
} as const;

export type GlobalPermissionCode = typeof GLOBAL_PERMISSIONS[keyof typeof GLOBAL_PERMISSIONS];

export const GLOBAL_PERMISSION_CODES: string[] = Object.values(GLOBAL_PERMISSIONS);

// =============================================================================
// GROUPES DE PERMISSIONS
// =============================================================================

/**
 * Permissions pour un utilisateur standard
 */
export const STANDARD_USER_PERMISSIONS: string[] = [
  USER_PERMISSIONS.USER_READ_OWN,
  USER_PERMISSIONS.USER_WRITE_OWN,
  ROLE_PERMISSIONS.ROLE_READ,
];

/**
 * Permissions pour un admin utilisateur
 */
export const USER_ADMIN_PERMISSIONS: string[] = [
  ...STANDARD_USER_PERMISSIONS,
  USER_PERMISSIONS.USER_READ_ALL,
  USER_PERMISSIONS.USER_MANAGE,
  USER_PERMISSIONS.USER_DELETE,
  ROLE_PERMISSIONS.ROLE_READ_ALL,
  ROLE_PERMISSIONS.ROLE_ASSIGN,
];

/**
 * Permissions pour un super admin
 */
export const SUPER_ADMIN_GLOBAL_PERMISSIONS: string[] = [
  ...GLOBAL_PERMISSION_CODES,
];
