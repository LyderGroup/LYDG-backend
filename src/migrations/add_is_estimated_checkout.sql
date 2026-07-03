-- BIS-2 : flag indiquant qu'un pointage de départ a été estimé a posteriori
-- (l'employé a oublié de pointer le jour J et l'a complété le lendemain
-- via /core/hr/attendance/:id/complete-checkout). Permet à la RH de
-- distinguer les heures réelles des heures déclarées sur honneur.

ALTER TABLE module_c_rh.office_attendances
  ADD COLUMN IF NOT EXISTS is_estimated_checkout BOOLEAN NOT NULL DEFAULT false;
