/**
 * Source unique de vérité des permissions du module Projets.
 *
 * RÈGLE D'OR : aucun code de permission ne doit être écrit en dur dans les
 * controllers ou services. Toujours référencer les constantes de ce fichier.
 *
 * Convention :
 *   projects.<ressource>.<action>[.<scope>]
 *   ex : projects.task.read.tenant, projects.project.create.tenant
 *
 * Les scopes représentent la portée d'application de la permission, du plus
 * restrictif au plus large :
 *   own        → uniquement ses propres ressources
 *   project    → ressources du projet auquel l'utilisateur appartient
 *   team       → ressources de son équipe
 *   department → ressources de son département
 *   tenant     → toutes les ressources de l'organisation
 *   global     → cross-organisations (super-admin)
 */

// ────────────────────────────────────────────────────────────────────────
// Briques de base : ressources, actions, scopes
// ────────────────────────────────────────────────────────────────────────

export const PERM_SCOPES = [
  'own',
  'project',
  'team',
  'department',
  'tenant',
  'global',
] as const;
export type PermScope = (typeof PERM_SCOPES)[number];

/** Hiérarchie d'inclusion : un scope donne aussi tous ceux à gauche. */
const SCOPE_RANK: Record<PermScope, number> = {
  own: 0,
  project: 1,
  team: 2,
  department: 3,
  tenant: 4,
  global: 5,
};

/** Helper : code canonique d'une permission. */
function buildCode(resource: string, action: string, scope?: PermScope): string {
  return scope
    ? `projects.${resource}.${action}.${scope}`
    : `projects.${resource}.${action}`;
}

/**
 * Génère un objet `{ OWN, PROJECT, TEAM, DEPARTMENT, TENANT, GLOBAL, ALL_SCOPES }`
 * pour une combinaison ressource/action donnée et un sous-ensemble de scopes.
 *
 * Ex :
 *   const TASK_READ = buildScopedActions('task', 'read', PERM_SCOPES);
 *   TASK_READ.TENANT     → 'projects.task.read.tenant'
 *   TASK_READ.ALL_SCOPES → ['projects.task.read.own', ..., 'projects.task.read.global']
 */
function buildScopedActions<S extends readonly PermScope[]>(
  resource: string,
  action: string,
  scopes: S,
) {
  const out = {} as Record<Uppercase<S[number]>, string> & {
    ALL_SCOPES: string[];
  };
  for (const scope of scopes) {
    (out as any)[scope.toUpperCase()] = buildCode(resource, action, scope);
  }
  out.ALL_SCOPES = scopes.map(s => buildCode(resource, action, s));
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Définition centralisée des permissions par ressource
// ────────────────────────────────────────────────────────────────────────
//
// Chaque action référence uniquement les scopes qui ont un sens métier pour
// elle. Ex : `create` n'a pas besoin du scope `own` (on ne crée pas pour soi
// avant d'avoir créé).

export const PROJECT_PERMISSIONS = {
  // ─── Projets ───
  PROJECT: {
    READ: buildScopedActions('project', 'read', [
      'own', 'project', 'team', 'department', 'tenant', 'global',
    ] as const),
    CREATE: buildScopedActions('project', 'create', [
      'tenant', 'global',
    ] as const),
    UPDATE: buildScopedActions('project', 'update', [
      'own', 'project', 'tenant', 'global',
    ] as const),
    DELETE: buildScopedActions('project', 'delete', [
      'own', 'project', 'tenant', 'global',
    ] as const),
    EXPORT: buildScopedActions('project', 'export', [
      'tenant', 'global',
    ] as const),
    JOIN: buildScopedActions('project', 'join', ['tenant'] as const),
    LEAVE: buildScopedActions('project', 'leave', ['own'] as const),
  },

  // ─── Tâches ───
  TASK: {
    READ: buildScopedActions('task', 'read', [
      'own', 'project', 'team', 'department', 'tenant', 'global',
    ] as const),
    CREATE: buildScopedActions('task', 'create', [
      'project', 'tenant', 'global',
    ] as const),
    /** Alias historique : write = create+update au sens large. */
    WRITE: buildScopedActions('task', 'write', [
      'own', 'project', 'team', 'department', 'tenant', 'global',
    ] as const),
    UPDATE: buildScopedActions('task', 'update', [
      'own', 'project', 'team', 'department', 'tenant', 'global',
    ] as const),
    DELETE: buildScopedActions('task', 'delete', [
      'own', 'project', 'tenant', 'global',
    ] as const),
    VALIDATE: buildScopedActions('task', 'validate', [
      'project', 'team', 'department', 'tenant', 'global',
    ] as const),
    ASSIGN: buildScopedActions('task', 'assign', [
      'project', 'team', 'tenant',
    ] as const),
    EXPORT: buildScopedActions('task', 'export', ['tenant', 'global'] as const),
    CONTROL_TOWER: buildScopedActions('task', 'control_tower', [
      'tenant', 'global',
    ] as const),
  },

  // ─── Sous-tâches ───
  SUBTASK: {
    READ: buildScopedActions('subtask', 'read', [
      'own', 'project', 'tenant',
    ] as const),
    WRITE: buildScopedActions('subtask', 'write', [
      'own', 'project', 'tenant',
    ] as const),
    DELETE: buildScopedActions('subtask', 'delete', [
      'own', 'project', 'tenant',
    ] as const),
  },

  // ─── Commentaires ───
  COMMENT: {
    READ: buildScopedActions('comment', 'read', [
      'own', 'project', 'tenant',
    ] as const),
    WRITE: buildScopedActions('comment', 'write', [
      'own', 'project', 'tenant',
    ] as const),
    DELETE: buildScopedActions('comment', 'delete', [
      'own', 'project', 'tenant',
    ] as const),
  },

  // ─── Membres du projet ───
  MEMBER: {
    READ: buildScopedActions('member', 'read', [
      'project', 'tenant', 'global',
    ] as const),
    ADD: buildScopedActions('member', 'add', ['project', 'tenant'] as const),
    REMOVE: buildScopedActions('member', 'remove', [
      'project', 'tenant',
    ] as const),
  },

  // ─── Dépendances entre tâches ───
  DEPENDENCY: {
    READ: buildScopedActions('dependency', 'read', [
      'project', 'tenant',
    ] as const),
    WRITE: buildScopedActions('dependency', 'write', [
      'project', 'tenant',
    ] as const),
  },

  // ─── Workflow personnalisé du projet ───
  WORKFLOW: {
    READ: buildScopedActions('workflow', 'read', [
      'project', 'tenant',
    ] as const),
    MANAGE: buildScopedActions('workflow', 'manage', [
      'project', 'tenant',
    ] as const),
  },

  // ─── Rapports & analytics ───
  REPORTS: {
    READ: buildScopedActions('reports', 'read', ['tenant', 'global'] as const),
    EXPORT: buildScopedActions('reports', 'export', [
      'tenant', 'global',
    ] as const),
  },

  // ─── Paramètres du module ───
  SETTINGS: {
    READ: buildScopedActions('settings', 'read', ['tenant', 'global'] as const),
    MANAGE: buildScopedActions('settings', 'manage', [
      'tenant', 'global',
    ] as const),
  },
} as const;

// ────────────────────────────────────────────────────────────────────────
// Aplatissement : toutes les permissions sous forme de liste brute
// ────────────────────────────────────────────────────────────────────────

/** Liste exhaustive de tous les codes de permission du module Projets. */
export const PROJECT_PERMISSION_CODES: string[] = (() => {
  const out = new Set<string>();
  for (const resource of Object.values(PROJECT_PERMISSIONS)) {
    for (const action of Object.values(resource)) {
      for (const code of (action as any).ALL_SCOPES as string[]) {
        out.add(code);
      }
    }
  }
  return Array.from(out).sort();
})();

// ────────────────────────────────────────────────────────────────────────
// Helpers pour utilisation dans @RequirePermission([...]) et services
// ────────────────────────────────────────────────────────────────────────

/**
 * Retourne tous les codes d'une action pour une ressource (tous scopes confondus).
 * À utiliser dans `@RequirePermission([...])` pour autoriser n'importe quel
 * scope (le guard fait un OR).
 *
 * Ex : @RequirePermission(allScopesOf(PROJECT_PERMISSIONS.TASK.READ))
 */
export function allScopesOf(action: { ALL_SCOPES: string[] }): string[] {
  return action.ALL_SCOPES;
}

/**
 * Retourne les codes d'une action pour les scopes >= `minScope`.
 * Utile pour endpoints qui doivent au moins permettre `team` et plus large.
 *
 * Ex : scopesAtLeast(PROJECT_PERMISSIONS.TASK.READ, 'team')
 *      → ['projects.task.read.team', '...department', '...tenant', '...global']
 */
export function scopesAtLeast(
  action: { ALL_SCOPES: string[] },
  minScope: PermScope,
): string[] {
  const minRank = SCOPE_RANK[minScope];
  return action.ALL_SCOPES.filter(code => {
    const codeScope = code.split('.').pop() as PermScope;
    return SCOPE_RANK[codeScope] >= minRank;
  });
}

/**
 * Détermine le scope effectif d'un utilisateur pour une action donnée, en
 * prenant le plus large parmi ses permissions. Utilisé dans les services
 * pour filtrer les requêtes selon le scope.
 *
 * Ex : resolveUserScope(userPerms, PROJECT_PERMISSIONS.TASK.READ)
 *      → 'tenant' si l'utilisateur a `projects.task.read.tenant`
 */
export function resolveUserScope(
  userPermissionCodes: string[] | Set<string>,
  action: { ALL_SCOPES: string[] },
): PermScope | null {
  const perms =
    userPermissionCodes instanceof Set
      ? userPermissionCodes
      : new Set(userPermissionCodes);

  // Parcourir du plus large au plus restrictif et retourner le premier match.
  for (let rank = PERM_SCOPES.length - 1; rank >= 0; rank--) {
    const scope = PERM_SCOPES[rank];
    const code = action.ALL_SCOPES.find(c => c.endsWith(`.${scope}`));
    if (code && perms.has(code)) return scope;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────
// Pools de permissions (rôles préconfigurés)
// ────────────────────────────────────────────────────────────────────────

/** Membre d'un projet : voir et travailler sur ses propres tâches. */
export const PROJECT_MEMBER_PERMISSIONS: string[] = [
  PROJECT_PERMISSIONS.PROJECT.READ.OWN,
  PROJECT_PERMISSIONS.PROJECT.READ.PROJECT,
  PROJECT_PERMISSIONS.PROJECT.LEAVE.OWN,
  PROJECT_PERMISSIONS.TASK.READ.OWN,
  PROJECT_PERMISSIONS.TASK.READ.PROJECT,
  PROJECT_PERMISSIONS.TASK.CREATE.PROJECT,
  PROJECT_PERMISSIONS.TASK.UPDATE.OWN,
  PROJECT_PERMISSIONS.TASK.WRITE.OWN,
  PROJECT_PERMISSIONS.SUBTASK.READ.OWN,
  PROJECT_PERMISSIONS.SUBTASK.READ.PROJECT,
  PROJECT_PERMISSIONS.SUBTASK.WRITE.OWN,
  PROJECT_PERMISSIONS.COMMENT.READ.OWN,
  PROJECT_PERMISSIONS.COMMENT.READ.PROJECT,
  PROJECT_PERMISSIONS.COMMENT.WRITE.OWN,
  PROJECT_PERMISSIONS.MEMBER.READ.PROJECT,
  PROJECT_PERMISSIONS.DEPENDENCY.READ.PROJECT,
  PROJECT_PERMISSIONS.WORKFLOW.READ.PROJECT,
];

/** Chef de projet : gestion complète d'un projet auquel il appartient. */
export const PROJECT_LEAD_PERMISSIONS: string[] = [
  ...PROJECT_MEMBER_PERMISSIONS,
  PROJECT_PERMISSIONS.PROJECT.UPDATE.OWN,
  PROJECT_PERMISSIONS.PROJECT.UPDATE.PROJECT,
  PROJECT_PERMISSIONS.PROJECT.DELETE.OWN,
  PROJECT_PERMISSIONS.TASK.READ.TEAM,
  PROJECT_PERMISSIONS.TASK.WRITE.PROJECT,
  PROJECT_PERMISSIONS.TASK.UPDATE.PROJECT,
  PROJECT_PERMISSIONS.TASK.DELETE.PROJECT,
  PROJECT_PERMISSIONS.TASK.VALIDATE.PROJECT,
  PROJECT_PERMISSIONS.TASK.ASSIGN.PROJECT,
  PROJECT_PERMISSIONS.SUBTASK.WRITE.PROJECT,
  PROJECT_PERMISSIONS.SUBTASK.DELETE.PROJECT,
  PROJECT_PERMISSIONS.COMMENT.WRITE.PROJECT,
  PROJECT_PERMISSIONS.COMMENT.DELETE.PROJECT,
  PROJECT_PERMISSIONS.MEMBER.ADD.PROJECT,
  PROJECT_PERMISSIONS.MEMBER.REMOVE.PROJECT,
  PROJECT_PERMISSIONS.DEPENDENCY.WRITE.PROJECT,
  PROJECT_PERMISSIONS.WORKFLOW.MANAGE.PROJECT,
];

/** Manager équipe/département : visibilité élargie + validation. */
export const PROJECT_TEAM_MANAGER_PERMISSIONS: string[] = [
  ...PROJECT_LEAD_PERMISSIONS,
  PROJECT_PERMISSIONS.PROJECT.READ.TEAM,
  PROJECT_PERMISSIONS.PROJECT.READ.DEPARTMENT,
  PROJECT_PERMISSIONS.TASK.READ.DEPARTMENT,
  PROJECT_PERMISSIONS.TASK.VALIDATE.TEAM,
  PROJECT_PERMISSIONS.TASK.VALIDATE.DEPARTMENT,
  PROJECT_PERMISSIONS.TASK.WRITE.TEAM,
  PROJECT_PERMISSIONS.TASK.WRITE.DEPARTMENT,
  PROJECT_PERMISSIONS.TASK.UPDATE.TEAM,
  PROJECT_PERMISSIONS.TASK.UPDATE.DEPARTMENT,
  PROJECT_PERMISSIONS.TASK.ASSIGN.TEAM,
];

/** Admin Projets tenant : tout sauf scope global. */
export const PROJECT_TENANT_ADMIN_PERMISSIONS: string[] = [
  ...PROJECT_TEAM_MANAGER_PERMISSIONS,
  PROJECT_PERMISSIONS.PROJECT.READ.TENANT,
  PROJECT_PERMISSIONS.PROJECT.CREATE.TENANT,
  PROJECT_PERMISSIONS.PROJECT.UPDATE.TENANT,
  PROJECT_PERMISSIONS.PROJECT.DELETE.TENANT,
  PROJECT_PERMISSIONS.PROJECT.EXPORT.TENANT,
  PROJECT_PERMISSIONS.PROJECT.JOIN.TENANT,
  PROJECT_PERMISSIONS.TASK.READ.TENANT,
  PROJECT_PERMISSIONS.TASK.CREATE.TENANT,
  PROJECT_PERMISSIONS.TASK.WRITE.TENANT,
  PROJECT_PERMISSIONS.TASK.UPDATE.TENANT,
  PROJECT_PERMISSIONS.TASK.DELETE.TENANT,
  PROJECT_PERMISSIONS.TASK.VALIDATE.TENANT,
  PROJECT_PERMISSIONS.TASK.ASSIGN.TENANT,
  PROJECT_PERMISSIONS.TASK.EXPORT.TENANT,
  PROJECT_PERMISSIONS.TASK.CONTROL_TOWER.TENANT,
  PROJECT_PERMISSIONS.SUBTASK.READ.TENANT,
  PROJECT_PERMISSIONS.SUBTASK.WRITE.TENANT,
  PROJECT_PERMISSIONS.SUBTASK.DELETE.TENANT,
  PROJECT_PERMISSIONS.COMMENT.READ.TENANT,
  PROJECT_PERMISSIONS.COMMENT.WRITE.TENANT,
  PROJECT_PERMISSIONS.COMMENT.DELETE.TENANT,
  PROJECT_PERMISSIONS.MEMBER.READ.TENANT,
  PROJECT_PERMISSIONS.MEMBER.ADD.TENANT,
  PROJECT_PERMISSIONS.MEMBER.REMOVE.TENANT,
  PROJECT_PERMISSIONS.DEPENDENCY.READ.TENANT,
  PROJECT_PERMISSIONS.DEPENDENCY.WRITE.TENANT,
  PROJECT_PERMISSIONS.WORKFLOW.READ.TENANT,
  PROJECT_PERMISSIONS.WORKFLOW.MANAGE.TENANT,
  PROJECT_PERMISSIONS.REPORTS.READ.TENANT,
  PROJECT_PERMISSIONS.REPORTS.EXPORT.TENANT,
  PROJECT_PERMISSIONS.SETTINGS.READ.TENANT,
  PROJECT_PERMISSIONS.SETTINGS.MANAGE.TENANT,
];

/** Super-admin : toutes les permissions, tous scopes. */
export const PROJECT_SUPER_ADMIN_PERMISSIONS: string[] = [
  ...PROJECT_PERMISSION_CODES,
];

// ────────────────────────────────────────────────────────────────────────
// Anciens codes legacy (rétro-compat) — à supprimer après migration UI
// ────────────────────────────────────────────────────────────────────────
//
// Le frontend / des seeds historiques peuvent référencer ces codes. On les
// garde reconnus côté seeder pour ne pas casser l'existant. Ils sont
// considérés équivalents aux nouveaux codes ci-dessus.

/**
 * Code de la permission system.admin (super-admin global) — référencé dans
 * des requêtes SQL `IN (...)`. Centralisé ici pour éviter le hardcoding.
 */
export const SYSTEM_ADMIN_PERMISSION = 'system.admin';

/**
 * Codes legacy organisés en objet typé (pour usage dans les requêtes SQL
 * brutes qui doivent référencer ces codes par nom). Ne pas hardcoder ces
 * strings ailleurs — toujours référencer ces constantes.
 */
export const LEGACY_PROJECT_PERMISSIONS = {
  PROJECT_CREATE: 'project.create',
  PROJECT_CREATE_ALL: 'project.create.all',
  PROJECT_READ: 'project.read',
  PROJECT_READ_OWN: 'project.read.own',
  PROJECT_READ_ALL: 'project.read.all',
  PROJECT_EDIT: 'project.edit',
  PROJECT_EDIT_OWN: 'project.edit.own',
  PROJECT_DELETE: 'project.delete',
  PROJECT_EXPORT: 'project.export',
  PROJECT_TASK_CREATE: 'project.task.create',
  PROJECT_TASK_READ: 'project.task.read',
  PROJECT_TASK_EDIT: 'project.task.edit',
  PROJECT_TASK_DELETE: 'project.task.delete',
  PROJECT_TASK_MANAGE: 'project.task.manage',
  PROJECT_TASK_ASSIGN: 'project.task.assign',
  PROJECT_WORKFLOW_VALIDATE: 'project.workflow.validate',
  PROJECT_WORKFLOW_MANAGE: 'project.workflow.manage',
  PROJECT_MEMBERS_READ: 'project.members.read',
  PROJECT_MEMBERS_READ_ALL: 'project.members.read.all',
  PROJECT_MEMBERS_ADD: 'project.members.add',
  PROJECT_MEMBERS_REMOVE: 'project.members.remove',
  PROJECT_REPORTS_READ: 'project.reports.read',
  PROJECT_REPORTS_EXPORT: 'project.reports.export',
  PROJECT_SETTINGS_MANAGE: 'project.settings.manage',
} as const;

export const LEGACY_PROJECT_PERMISSION_CODES: string[] = Object.values(
  LEGACY_PROJECT_PERMISSIONS,
);

/**
 * Groupe de codes legacy considérés comme "lecture globale tous projets".
 * Utilisé dans les requêtes SQL `IN (...)` qui vérifient les droits admin
 * de lecture cross-projet.
 */
export const LEGACY_READ_ALL_CODES: string[] = [
  LEGACY_PROJECT_PERMISSIONS.PROJECT_READ_ALL,
  LEGACY_PROJECT_PERMISSIONS.PROJECT_MEMBERS_READ_ALL,
  SYSTEM_ADMIN_PERMISSION,
];

export type ProjectPermissionCode = string;
