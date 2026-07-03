-- ============================================================================
-- Sprint B : Soft-delete uniformisé sur le module Projets
--
-- Ajoute deleted_at / deleted_by / deletion_reason sur toutes les tables
-- du schéma module_b_projects. Crée un index partiel pour exclure
-- rapidement les soft-deleted dans les requêtes courantes.
--
-- IDEMPOTENT : ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
-- ============================================================================

DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'module_b_projects'
      AND table_type = 'BASE TABLE'
      -- On exclut les tables d'historique pure (events, logs) qui ne
      -- doivent jamais être soft-deletées (mais peuvent être purgées
      -- après rétention).
      AND table_name NOT IN ('task_events', 'project_events')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL',
      tbl.table_schema, tbl.table_name
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS deleted_by UUID NULL',
      tbl.table_schema, tbl.table_name
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS deletion_reason TEXT NULL',
      tbl.table_schema, tbl.table_name
    );
    -- Index partiel pour exclure rapidement les soft-deleted
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%I_active ON %I.%I (id) WHERE deleted_at IS NULL',
      tbl.table_name, tbl.table_schema, tbl.table_name
    );
  END LOOP;
END $$;

-- Verrouillage légal (immuabilité) — pour les entités à valeur probante
-- du module Projets (rares, mais utiles : par ex. les validations
-- workflow ne devraient pas pouvoir être modifiées après finalisation).
DO $$
DECLARE
  tbl TEXT;
  legal_tables TEXT[] := ARRAY[
    'module_b_projects.task_workflow_validations',
    'module_b_projects.validation_requests'
  ];
BEGIN
  FOREACH tbl IN ARRAY legal_tables
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE %s ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE',
        tbl
      );
      EXECUTE format(
        'ALTER TABLE %s ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP NULL',
        tbl
      );
      EXECUTE format(
        'ALTER TABLE %s ADD COLUMN IF NOT EXISTS locked_by UUID NULL',
        tbl
      );
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;
END $$;
