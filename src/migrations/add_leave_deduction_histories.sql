-- Historique des déductions de congé : trace immuable de chaque opération
-- d'application/annulation de déduction. Permet de reconstituer le solde à
-- n'importe quel instant et d'afficher l'historique RH dans le profil employé.

CREATE TABLE IF NOT EXISTS module_c_rh.leave_deduction_histories (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid NOT NULL REFERENCES module_c_rh.employees(id) ON DELETE CASCADE,
  organization_id          uuid NOT NULL,
  applied_by               uuid NULL REFERENCES core.users(id) ON DELETE SET NULL,
  applied_at               timestamp NOT NULL DEFAULT NOW(),
  record_type              varchar(20) NOT NULL CHECK (record_type IN ('attendance', 'leave_request')),
  record_id                uuid NOT NULL,
  absence_type             varchar(50) NOT NULL,
  hours                    decimal(6,2) NOT NULL DEFAULT 0,
  days_equivalent          decimal(6,2) NOT NULL DEFAULT 0,
  previous_remaining_days  decimal(6,2) NOT NULL,
  new_remaining_days       decimal(6,2) NOT NULL,
  is_cancellation          boolean NOT NULL DEFAULT false,
  comment                  text NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_deduction_employee_year
  ON module_c_rh.leave_deduction_histories(employee_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_leave_deduction_organization
  ON module_c_rh.leave_deduction_histories(organization_id, applied_at DESC);
