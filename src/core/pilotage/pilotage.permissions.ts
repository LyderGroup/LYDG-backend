/**
 * Permissions du module A (Pilotage Stratégique).
 * Convention : `pilotage.<ressource>.<action>` cohérente avec finance.* / academy.* / documents.*
 *
 * Avant : les routes Pilotage étaient gardées soit par RolesGuard simple
 * (lecture du dashboard ouverte à tout authentifié du tenant) soit par la
 * permission globale `system.config` (écriture KPI/objectifs réservée au
 * SUPER_ADMIN). Aucune granularité — un comité de direction qui doit
 * lire mais pas modifier devait recevoir `system.config`, sur-privilégié.
 *
 * Découpage CRUD strict par ressource (dashboards / objectifs / KPIs /
 * valeurs / reports) pour permettre des rôles "lecteur", "analyste"
 * (saisie de valeurs) et "architecte" (création de KPI/objectifs).
 */
export const PILOTAGE_PERMISSIONS = {
  // Visibilité du module entier (gate UI)
  PILOTAGE_ACCESS: 'pilotage.access',

  // Dashboards (lecture des données agrégées)
  PILOTAGE_DASHBOARD_READ:              'pilotage.dashboard.read',
  PILOTAGE_DASHBOARD_CONSOLIDATED_READ: 'pilotage.dashboard.consolidated.read',

  // Objectifs stratégiques
  PILOTAGE_OBJECTIVES_READ:   'pilotage.objectives.read',
  PILOTAGE_OBJECTIVES_CREATE: 'pilotage.objectives.create',
  PILOTAGE_OBJECTIVES_UPDATE: 'pilotage.objectives.update',
  PILOTAGE_OBJECTIVES_DELETE: 'pilotage.objectives.delete',

  // KPIs (définitions)
  PILOTAGE_KPIS_READ:   'pilotage.kpis.read',
  PILOTAGE_KPIS_CREATE: 'pilotage.kpis.create',
  PILOTAGE_KPIS_UPDATE: 'pilotage.kpis.update',
  PILOTAGE_KPIS_DELETE: 'pilotage.kpis.delete',

  // Valeurs KPI (mesures dans le temps)
  //  Note : pas d'UPDATE — les mesures sont historiques, on les supprime
  //  et on recrée si correction nécessaire (audit cleaner).
  PILOTAGE_KPI_VALUES_READ:   'pilotage.kpi_values.read',
  PILOTAGE_KPI_VALUES_CREATE: 'pilotage.kpi_values.create',
  PILOTAGE_KPI_VALUES_DELETE: 'pilotage.kpi_values.delete',

  // Reports & exports
  PILOTAGE_REPORTS_READ:   'pilotage.reports.read',
  PILOTAGE_REPORTS_EXPORT: 'pilotage.reports.export',
} as const;

export type PilotagePermissionCode = typeof PILOTAGE_PERMISSIONS[keyof typeof PILOTAGE_PERMISSIONS];

export const PILOTAGE_PERMISSION_CODES: string[] = Object.values(PILOTAGE_PERMISSIONS);

export const PILOTAGE_MODULE_CODE = 'module_a_pilotage';
