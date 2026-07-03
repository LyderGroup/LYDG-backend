
CREATE TABLE IF NOT EXISTS core.audit_logs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL,
  occurred_at            TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Qui
  actor_user_id          UUID,
  actor_ip               INET,
  actor_user_agent       TEXT,
  request_id             VARCHAR(64),

  -- Quoi
  entity_type            VARCHAR(100) NOT NULL,
  entity_id              UUID NOT NULL,
  action                 VARCHAR(30) NOT NULL,
  -- CREATE | UPDATE | SOFT_DELETE | RESTORE | HARD_DELETE
  -- | READ_SENSITIVE | LOCK | UNLOCK | LOGIN | LOGOUT | EXPORT

  -- État avant/après (JSONB pour requêtes flexibles)
  before_state           JSONB,
  after_state            JSONB,
  changed_fields         TEXT[],

  -- Contexte métier
  reason                 TEXT,
  metadata               JSONB,

  -- Marquage conformité
  is_legally_significant BOOLEAN NOT NULL DEFAULT FALSE,
  retention_until        DATE  -- date d'éligibilité à la purge (10 ans par défaut)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON core.audit_logs (organization_id, entity_type, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON core.audit_logs (actor_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_legal
  ON core.audit_logs (occurred_at)
  WHERE is_legally_significant = TRUE;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON core.audit_logs (organization_id, action, occurred_at DESC);

COMMENT ON TABLE core.audit_logs IS
  'Audit trail global. Conformité OHADA : rétention min 10 ans pour is_legally_significant=true.';


-- 2. Colonnes soft-delete sur TOUTES les entités RH/Core qui n'en ont pas
-- ----------------------------------------------------------------------------
-- Pattern : deleted_at TIMESTAMP NULL, deleted_by UUID NULL, deletion_reason TEXT NULL

DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('core', 'module_c_rh')
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('audit_logs', 'login_history', 'fcm_tokens',
                             'notifications', 'leave_deduction_histories')
  LOOP
    -- deleted_at
    EXECUTE format(
      'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL',
      tbl.table_schema, tbl.table_name
    );
    -- deleted_by
    EXECUTE format(
      'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS deleted_by UUID NULL',
      tbl.table_schema, tbl.table_name
    );
    -- deletion_reason
    EXECUTE format(
      'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS deletion_reason TEXT NULL',
      tbl.table_schema, tbl.table_name
    );
    -- Index partiel pour exclure les soft-deleted rapidement
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%I_active ON %I.%I (id) WHERE deleted_at IS NULL',
      tbl.table_name, tbl.table_schema, tbl.table_name
    );
  END LOOP;
END $$;


 
DO $$
DECLARE
  tbl TEXT;
  legal_tables TEXT[] := ARRAY[
    'module_c_rh.employee_salary_history',
    'module_c_rh.employee_bonuses',
    'module_c_rh.employee_sanctions',
    'module_c_rh.office_attendances',
    'module_c_rh.attendances',
    'module_c_rh.leave_requests',
    'module_c_rh.salary_payments',
    'module_c_rh.electronic_signatures'
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
      -- Table n'existe pas dans cette installation, on ignore
      NULL;
    END;
  END LOOP;
END $$;


-- 4. Permissions audit (RBAC)
-- ----------------------------------------------------------------------------
-- À jouer dans seed_permissions.sql si pas déjà présent :
--   hr.audit.read     : voir l'historique d'une entité RH
--   core.audit.read   : voir l'historique d'une entité core (admin)
--   core.audit.export : exporter le journal (rapport inspection du travail)
--   *.restore         : restaurer une entité soft-deleted
--   *.purge           : suppression physique après prescription (très restreint)

INSERT INTO core.permissions (code, name, description, system_module_code, created_at, updated_at)
VALUES
  ('hr.audit.read',     'Lire audit RH',              'Consulter l''historique des modifications RH',     'module_c_rh', NOW(), NOW()),
  ('core.audit.read',   'Lire audit système',         'Consulter l''historique des modifications core',    'core',        NOW(), NOW()),
  ('core.audit.export', 'Exporter audit',             'Exporter le journal d''audit (PDF/CSV)',           'core',        NOW(), NOW()),
  ('core.records.purge','Purger soft-deleted',        'Suppression physique après prescription légale',  'core',        NOW(), NOW())
ON CONFLICT (code) DO NOTHING;
