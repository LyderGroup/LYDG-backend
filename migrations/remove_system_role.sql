-- Migration: Supprimer la colonne is_system_role
-- Description: Plus de rôles système - tout basé sur les permissions
-- Date: 2026-04-27

-- 1. Mettre à jour les rôles qui étaient marqués comme système pour avoir organization_id
UPDATE core.roles 
SET organization_id = (
    SELECT o.id FROM core.organizations o ORDER BY o.created_at LIMIT 1
)
WHERE is_system_role = true AND organization_id IS NULL;
 
ALTER TABLE core.roles DROP COLUMN IF EXISTS is_system_role;
 
COMMENT ON TABLE core.roles IS 'Tous les rôles sont maintenant liés à une organisation. Les permissions contrôlent l''accès.';
