/**
 * Libellés lisibles des permissions.
 *
 * Les libellés stockés en base viennent de deux sources incohérentes : les
 * seeds SQL posent du français correct, tandis que `formatDisplayName` du
 * semeur TypeScript produit « Hr Employees Read All » à partir du nom de la
 * constante. Résultat, la liste des permissions est illisible pour qui ne
 * connaît pas la nomenclature.
 *
 * Plutôt qu'un dictionnaire de 335 entrées à maintenir, on **compose** le
 * libellé à partir du code, qui est structuré :
 *
 *     <domaine>.<ressource>[.<sous-ressource>].<action>[.<portée>]
 *     hr.employees.read.all  →  « Consulter les fiches des collaborateurs
 *                                 de toute l'organisation »
 *
 * Trois dictionnaires suffisent (ressources, actions, portées), plus une table
 * d'exceptions pour les codes qui ne suivent pas le motif. Le calcul se fait à
 * la lecture : aucune migration à rejouer quand on améliore une formulation.
 */

/** Portées, formulées sans jargon technique. */
const SCOPE_LABELS: Record<string, string> = {
  own: 'qui le concernent',
  team: 'de son équipe',
  department: 'de son département',
  project: 'de ses projets',
  tenant: 'de sa filiale',
  global: 'de tout le groupe',
  all: "de toute l'organisation",
};

/** Verbes d'action. */
const ACTION_LABELS: Record<string, string> = {
  read: 'Consulter',
  write: 'Modifier',
  update: 'Modifier',
  edit: 'Modifier',
  create: 'Créer',
  delete: 'Supprimer',
  remove: 'Retirer',
  add: 'Ajouter',
  manage: 'Gérer',
  export: 'Exporter',
  validate: 'Valider',
  approve: 'Approuver',
  reject: 'Refuser',
  assign: 'Affecter',
  upload: 'Déposer',
  sign: 'Signer',
  restore: 'Restaurer',
  publish: 'Publier',
  issue: 'Émettre',
  cancel: 'Annuler',
  reconcile: 'Rapprocher',
  justify: 'Justifier',
  enroll: 'Inscrire',
  terminate: 'Clôturer',
  access: 'Accéder à',
  comment: 'Commenter',
  join: 'Rejoindre',
  leave: 'Quitter',
  // Anciennes nomenclatures, conservées pour rétro-compatibilité.
  read_all: 'Consulter',
  read_team: 'Consulter',
  view: 'Consulter',
  view_all: 'Consulter',
  view_own: 'Consulter',
  view_team: 'Consulter',
  attach_files: 'Joindre des fichiers à',
  manage_subtasks: 'Gérer les sous-tâches de',
  manage_members: 'Gérer les membres de',
  manage_workflow: 'Gérer le circuit de validation de',
  manage_contract: 'Gérer le contrat de',
  update_role: 'Changer le rôle de',
  view_sensitive: 'Voir les informations sensibles de',
};

/**
 * Portée implicite de certaines actions héritées : `view_team` porte déjà sa
 * portée dans le verbe, le code n'a pas de segment dédié.
 */
const IMPLICIT_SCOPE: Record<string, string> = {
  read_all: 'all',
  read_team: 'team',
  view_all: 'all',
  view_own: 'own',
  view_team: 'team',
};

/**
 * Ressources, au pluriel et sans jargon — c'est la partie qui rend le libellé
 * compréhensible par quelqu'un qui n'a pas construit l'application.
 */
const RESOURCE_NOUNS: Record<string, string> = {
  // Administration
  user: 'les comptes utilisateurs',
  role: 'les profils',
  'role.permissions': 'les permissions des profils',
  system: 'le système',

  // RH
  'hr.employees': 'les fiches des collaborateurs',
  'hr.salary': 'les salaires',
  'hr.bonus': 'les primes',
  'hr.organizations': 'les filiales',
  'hr.attendance': 'les pointages',
  'hr.leave': 'les congés',
  'hr.conges': 'les congés',
  'hr.documents': 'les documents RH',
  'hr.required_documents': 'les pièces obligatoires du dossier',
  'hr.training': 'les formations',
  'hr.evaluation': 'les évaluations',
  'hr.sanctions': 'les sanctions',
  'hr.recruitment': 'le recrutement',
  'hr.internal-life': 'la vie interne',
  'hr.guardian': 'les questionnaires Guardian',
  'hr.ticket': 'les demandes RH',
  'hr.rituals': 'les rituels',
  'hr.permissions': 'les permissions RH',
  'hr.settings': 'les paramètres RH',
  journal: 'le journal des collaborateurs',

  // Projets — nouvelle nomenclature
  'projects.project': 'les projets',
  'projects.task': 'les tâches',
  'projects.subtask': 'les sous-tâches',
  'projects.comment': 'les commentaires',
  'projects.member': 'les membres de projet',
  'projects.dependency': 'les dépendances entre tâches',
  'projects.workflow': 'les circuits de validation',
  'projects.settings': 'les paramètres des projets',
  'projects.reports': 'les rapports de projet',

  // Projets — ancienne nomenclature
  project: 'les projets',
  'project.task': 'les tâches',
  'project.members': 'les membres de projet',
  'project.workflow': 'les circuits de validation',
  'project.reports': 'les rapports de projet',
  'project.settings': 'les paramètres des projets',
  task: 'les tâches',
  member: 'les membres de projet',
  employee: 'les fiches des collaborateurs',
  attendance: 'les pointages',

  // Pilotage
  pilotage: 'le pilotage',
  'pilotage.dashboard': 'les tableaux de bord',
  'pilotage.dashboard.consolidated': 'le tableau de bord consolidé',
  'pilotage.kpis': 'les indicateurs',
  'pilotage.kpi_values': 'les valeurs des indicateurs',
  'pilotage.objectives': 'les objectifs',
  'pilotage.reports': 'les rapports de pilotage',

  // Finance
  finance: 'la finance',
  'finance.contacts': 'les contacts commerciaux',
  'finance.invoices': 'les factures',
  'finance.payments': 'les paiements',

  // Academy
  academy: "l'academy",
  'academy.courses': 'les cours',
  'academy.categories': 'les catégories de cours',
  'academy.enrollments': 'les inscriptions',
  'academy.sessions': 'les sessions de formation',

  // Documents
  documents: 'les documents',
  'documents.libraries': 'les bibliothèques',
  'documents.folders': 'les dossiers',
};

/**
 * Codes qui ne suivent pas le motif action/portée, ou dont la composition
 * donnerait un résultat trompeur.
 */
const EXPLICIT_LABELS: Record<
  string,
  { displayName: string; description: string }
> = {
  'system.admin': {
    displayName: 'Administrer toute la plateforme',
    description:
      'Donne tous les droits, sur tous les modules et toutes les filiales. À réserver à un très petit nombre de personnes.',
  },
  'system.config': {
    displayName: 'Modifier la configuration du système',
    description:
      'Paramètres techniques de la plateforme, en dehors des réglages métier.',
  },
  'system.backup': {
    displayName: 'Lancer et télécharger les sauvegardes',
    description: 'Sauvegardes de la base de données.',
  },
  'system.audit': {
    displayName: "Consulter le journal d'audit",
    description:
      "Historique de qui a fait quoi et quand, sur l'ensemble de la plateforme.",
  },
  'user.impersonate': {
    displayName: "Se connecter à la place d'un autre utilisateur",
    description:
      "Permet de voir l'application exactement comme la voit une autre personne. Utile pour le support, sensible par nature.",
  },
  'user.manage': {
    displayName: 'Créer et gérer les comptes utilisateurs',
    description: 'Créer, modifier, désactiver les accès à la plateforme.',
  },
  'role.assign': {
    displayName: 'Attribuer des profils aux utilisateurs',
    description:
      'Décider quel profil — donc quels droits — chaque personne possède.',
  },
  'pilotage.access': {
    displayName: 'Accéder au module Pilotage',
    description:
      "Sans cette permission, le module n'apparaît pas dans le menu.",
  },
  'finance.access': {
    displayName: 'Accéder au module Finance',
    description:
      "Sans cette permission, le module n'apparaît pas dans le menu.",
  },
  'projects.task.control_tower.tenant': {
    displayName: 'Voir la tour de contrôle des tâches de sa filiale',
    description:
      "Vue d'ensemble de toutes les tâches de la filiale, tous projets confondus.",
  },
  'projects.task.control_tower.global': {
    displayName: 'Voir la tour de contrôle des tâches du groupe',
    description:
      "Vue d'ensemble de toutes les tâches, toutes filiales confondues.",
  },
  'attendance.checkin': {
    displayName: 'Pointer son arrivée',
    description: "Enregistrer son heure d'arrivée au travail.",
  },
  'attendance.checkout': {
    displayName: 'Pointer son départ',
    description: 'Enregistrer son heure de départ du travail.',
  },
  'employee.terminate': {
    displayName: "Clôturer le contrat d'un collaborateur",
    description:
      "Marquer la fin du contrat. La fiche est conservée, le collaborateur n'est plus compté dans l'effectif actif.",
  },
  'hr.attendance.justify': {
    displayName: 'Justifier un retard ou une absence',
    description: "Enregistrer le motif d'un pointage incomplet ou manquant.",
  },
  'hr.documents.sign': {
    displayName: 'Signer des documents RH',
    description:
      'Apposer une signature sur un document du dossier du collaborateur.',
  },
  'hr.required_documents.validate': {
    displayName: 'Valider les pièces du dossier',
    description: 'Accepter ou refuser un document déposé par un collaborateur.',
  },
};

/** Les segments reconnus comme une portée. */
function isScope(token: string): boolean {
  return token in SCOPE_LABELS;
}

/** Les segments reconnus comme une action. */
function isAction(token: string): boolean {
  return token in ACTION_LABELS;
}

/** Repli : `required_documents` → « required documents ». */
function humanize(token: string): string {
  return token.replace(/[._-]+/g, ' ').trim();
}

/**
 * Contracte les prépositions produites par la composition.
 *
 * Certains verbes se terminent par « de » ou « à » (« Changer le rôle de »),
 * et les ressources commencent par un article (« les membres »). Sans cette
 * étape on obtient « de les membres » au lieu de « des membres ».
 */
function contractPrepositions(text: string): string {
  // Espaces explicites plutot que des limites de mot : la composition place
  // toujours un espace de part et d'autre, et cela evite tout echappement.
  return text
    .replace(' de les ', ' des ')
    .replace(' a les ', ' aux ')
    .replace(' à les ', ' aux ')
    .replace(' de le ', ' du ')
    .replace(' à le ', ' au ')
    .replace(" de l'", " de l'");
}

export interface PermissionLabel {
  displayName: string;
  description: string;
}

/**
 * Compose le libellé et l'explication d'un code de permission.
 *
 * Le découpage se fait par la droite : la portée d'abord si elle est présente,
 * puis l'action. Ce qui reste est la ressource. Un code non reconnu retombe sur
 * une forme humanisée plutôt que sur une chaîne vide.
 */
export function buildPermissionLabel(code: string): PermissionLabel {
  const explicit = EXPLICIT_LABELS[code];
  if (explicit) return explicit;

  const parts = code.split('.').filter(Boolean);
  if (parts.length === 0) {
    return { displayName: code, description: '' };
  }

  let cursor = parts.length;
  let scope: string | null = null;
  let action: string | null = null;

  // Portée en dernière position (hr.employees.read.all → all).
  if (cursor > 1 && isScope(parts[cursor - 1])) {
    scope = parts[cursor - 1];
    cursor -= 1;
  }

  // Action juste avant (… .read. … → read).
  if (cursor > 1 && isAction(parts[cursor - 1])) {
    action = parts[cursor - 1];
    cursor -= 1;
  }

  const resourceKey = parts.slice(0, cursor).join('.');
  const resource =
    RESOURCE_NOUNS[resourceKey] ?? `« ${humanize(resourceKey || code)} »`;

  // Certaines actions héritées portent leur portée dans le verbe.
  if (action && !scope && IMPLICIT_SCOPE[action]) {
    scope = IMPLICIT_SCOPE[action];
  }

  const verb = action ? ACTION_LABELS[action] : null;
  if (!verb) {
    // Pas d'action identifiable : on reste descriptif sans inventer de verbe.
    return {
      displayName: `${resource.charAt(0).toUpperCase()}${resource.slice(1)}`,
      description: `Permission « ${code} ».`,
    };
  }

  const scopeSuffix = scope ? ` ${SCOPE_LABELS[scope]}` : '';
  const displayName = contractPrepositions(`${verb} ${resource}${scopeSuffix}`);

  const description = contractPrepositions(
    scope
      ? `Porte uniquement sur ${resource} ${SCOPE_LABELS[scope]}.`
      : `Porte sur ${resource}.`,
  );

  return { displayName, description };
}
