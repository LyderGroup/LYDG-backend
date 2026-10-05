-- Migration: réseaux sociaux des organisations
--
-- Stocké en JSONB plutôt qu'en colonnes dédiées (linkedin_url, facebook_url…) :
-- le formulaire permet d'ajouter autant d'entrées que voulu, et la liste des
-- plateformes évolue sans migration.
--
-- Forme attendue : [{"network": "linkedin", "url": "https://..."}, ...]
--
-- Idempotent, rejouable sans risque.

ALTER TABLE core.organizations
  ADD COLUMN IF NOT EXISTS social_networks JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Vérification
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'core'
  AND table_name = 'organizations'
  AND column_name = 'social_networks';
