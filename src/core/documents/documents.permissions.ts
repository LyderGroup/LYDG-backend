/**
 * Permissions du module F (GED & Centre de ressources).
 *
 * Découpage CRUD strict pour pouvoir donner des rôles "lecteur",
 * "contributeur" (création) et "rédacteur" (édition) séparément.
 *
 * Avant : un seul WRITE couvrait POST + PATCH → impossible de donner
 * "création seule" sans "édition" et vice-versa.
 */
export const DOCUMENTS_PERMISSIONS = {
  // Bibliothèques (espaces documentaires)
  DOCS_LIBRARIES_READ:   'documents.libraries.read',
  DOCS_LIBRARIES_CREATE: 'documents.libraries.create',
  DOCS_LIBRARIES_UPDATE: 'documents.libraries.update',
  DOCS_LIBRARIES_DELETE: 'documents.libraries.delete',

  // Dossiers
  DOCS_FOLDERS_READ:   'documents.folders.read',
  DOCS_FOLDERS_CREATE: 'documents.folders.create',
  DOCS_FOLDERS_UPDATE: 'documents.folders.update',
  DOCS_FOLDERS_DELETE: 'documents.folders.delete',

  // Export / audit
  DOCS_EXPORT: 'documents.export',
} as const;

export type DocumentsPermissionCode = typeof DOCUMENTS_PERMISSIONS[keyof typeof DOCUMENTS_PERMISSIONS];
export const DOCUMENTS_PERMISSION_CODES: string[] = Object.values(DOCUMENTS_PERMISSIONS);

export const DOCUMENTS_MODULE_CODE = 'module_f_documents';

export const CONFIDENTIALITY_LEVELS = ['public', 'internal', 'confidential', 'restricted', 'secret'] as const;
export type ConfidentialityLevel = (typeof CONFIDENTIALITY_LEVELS)[number];
