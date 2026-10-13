/**
 * Valeurs autorisees par les contraintes CHECK de `module_c_rh.employees`.
 *
 * Elles etaient implicites : le formulaire envoyait ce qu'il voulait et la
 * base rejetait, produisant un 500 opaque. Deux incidents de ce type (d'abord
 * `contract_type`, puis `employment_type`). On les declare donc ici et on
 * valide a l'entree, pour obtenir un 400 explicite plutot qu'une violation de
 * contrainte.
 *
 * Toute evolution doit rester alignee sur :
 *   employees_employment_type_check
 *   employees_contract_type_check
 */

export const EMPLOYMENT_TYPES = [
  'permanent',
  'temporary',
  'part_time',
  'full_time',
  'intern',
  'contractor',
  'freelance',
] as const;

export const CONTRACT_TYPES = [
  'CDI',
  'CDD',
  'CTT',
  'CTP',
  'apprenticeship',
  'internship',
  'freelance',
  'contractor',
] as const;
