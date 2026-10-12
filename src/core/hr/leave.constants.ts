/**
 * Regles de conges, valables pour toute l'organisation.
 *
 * Ces valeurs etaient auparavant portees par `employees.annual_leave_days`,
 * colonne laissee a NULL pour 7 employes sur 10 — d'ou un solde calcule sur
 * "0 jour/an" et des totaux negatifs. Deux fiches portaient meme 220 et 300
 * jours. On fige donc la regle ici plutot que de dependre d'une saisie.
 */

/** Droit annuel, identique pour tous. */
export const ANNUAL_LEAVE_DAYS = 30;

/**
 * Duree maximale d'une seule demande. Prendre les 30 jours d'un bloc
 * desorganise les equipes : au-dela d'une semaine, il faut fractionner.
 */
export const MAX_LEAVE_DAYS_PER_REQUEST = 7;
