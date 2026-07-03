/**
 * Permissions du module D (Finance, CRM & Partenaires).
 * Convention : `finance.<domaine>.<action>` cohérente avec hr.* / projects.*
 *
 * Découpage CRUD strict (read / create / update / delete) pour pouvoir
 * donner séparément un rôle "saisie" (create only) à un commercial et un
 * rôle "édition" (update only) à un comptable.
 */
export const FINANCE_PERMISSIONS = {
  // Visibilité du module entier (gate UI)
  FINANCE_ACCESS: 'finance.access',

  // CRM (Contacts : clients / fournisseurs / partenaires)
  FINANCE_CONTACTS_READ:   'finance.contacts.read',
  FINANCE_CONTACTS_CREATE: 'finance.contacts.create',
  FINANCE_CONTACTS_UPDATE: 'finance.contacts.update',
  FINANCE_CONTACTS_DELETE: 'finance.contacts.delete',

  // Facturation
  FINANCE_INVOICES_READ:   'finance.invoices.read',
  FINANCE_INVOICES_CREATE: 'finance.invoices.create',
  FINANCE_INVOICES_UPDATE: 'finance.invoices.update',
  FINANCE_INVOICES_ISSUE:  'finance.invoices.issue',     // passer draft → sent
  FINANCE_INVOICES_CANCEL: 'finance.invoices.cancel',
  FINANCE_INVOICES_DELETE: 'finance.invoices.delete',

  // Encaissements
  FINANCE_PAYMENTS_READ:      'finance.payments.read',
  FINANCE_PAYMENTS_CREATE:    'finance.payments.create',
  FINANCE_PAYMENTS_UPDATE:    'finance.payments.update',
  FINANCE_PAYMENTS_RECONCILE: 'finance.payments.reconcile',
  FINANCE_PAYMENTS_DELETE:    'finance.payments.delete',

  // Export / KPI
  FINANCE_EXPORT: 'finance.export',
} as const;

export type FinancePermissionCode = typeof FINANCE_PERMISSIONS[keyof typeof FINANCE_PERMISSIONS];

export const FINANCE_PERMISSION_CODES: string[] = Object.values(FINANCE_PERMISSIONS);

export const FINANCE_MODULE_CODE = 'module_d_finance';
