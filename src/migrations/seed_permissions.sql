 
-- Employés - Lecture
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.employees.read', 'hr.employees', 'read', 'Lire les employés', 'Permission de lire les informations des employés', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.employees.read.own', 'hr.employees', 'read.own', 'Lire son profil', 'Permission de lire son propre profil employé', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.employees.read.team', 'hr.employees', 'read.team', 'Lire son équipe', 'Permission de lire les employés de son équipe', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.employees.read.all', 'hr.employees', 'read.all', 'Lire tous les employés', 'Permission de lire tous les employés de l''organisation', 'hr', false, NOW())
ON CONFLICT DO NOTHING;

-- Employés - Écriture
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.employees.write', 'hr.employees', 'write', 'Modifier les employés', 'Permission de modifier les employés', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.employees.write.own', 'hr.employees', 'write.own', 'Modifier son profil', 'Permission de modifier son propre profil', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.employees.write.team', 'hr.employees', 'write.team', 'Modifier son équipe', 'Permission de modifier les employés de son équipe', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.employees.write.all', 'hr.employees', 'write.all', 'Modifier tous les employés', 'Permission de modifier tous les employés', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.employees.delete', 'hr.employees', 'delete', 'Supprimer des employés', 'Permission de supprimer des employés', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.employees.restore', 'hr.employees', 'restore', 'Restaurer des employés', 'Permission de restaurer des employés supprimés', 'hr', false, NOW())
ON CONFLICT DO NOTHING;

-- Salaires
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.salary.read', 'hr.salary', 'read', 'Lire les salaires', 'Permission de lire les informations salariales', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.salary.read.own', 'hr.salary', 'read.own', 'Lire son salaire', 'Permission de lire son propre salaire', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.salary.read.team', 'hr.salary', 'read.team', 'Lire salaires équipe', 'Permission de lire les salaires de son équipe', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.salary.read.all', 'hr.salary', 'read.all', 'Lire tous les salaires', 'Permission de lire tous les salaires', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.salary.write', 'hr.salary', 'write', 'Modifier les salaires', 'Permission de modifier les salaires', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.salary.write.all', 'hr.salary', 'write.all', 'Modifier tous les salaires', 'Permission de modifier tous les salaires', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.salary.export', 'hr.salary', 'export', 'Exporter les salaires', 'Permission d''exporter les données salariales', 'hr', false, NOW())
ON CONFLICT DO NOTHING;

-- Pointage & Présence
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.attendance.read', 'hr.attendance', 'read', 'Lire les pointages', 'Permission de lire les données de pointage', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.attendance.read.own', 'hr.attendance', 'read.own', 'Lire ses pointages', 'Permission de lire ses propres pointages', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.attendance.read.team', 'hr.attendance', 'read.team', 'Lire pointages équipe', 'Permission de lire les pointages de son équipe', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.attendance.read.all', 'hr.attendance', 'read.all', 'Lire tous les pointages', 'Permission de lire tous les pointages', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.attendance.write', 'hr.attendance', 'write', 'Pointer', 'Permission de pointer (check-in/out)', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.attendance.justify', 'hr.attendance', 'justify', 'Justifier absences', 'Permission de justifier les absences', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.attendance.manage', 'hr.attendance', 'manage', 'Gérer les pointages', 'Permission de gérer tous les pointages', 'hr', false, NOW())
ON CONFLICT DO NOTHING;

-- Congés
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.conges.read', 'hr.conges', 'read', 'Lire les congés', 'Permission de lire les demandes de congés', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.conges.read.own', 'hr.conges', 'read.own', 'Lire ses congés', 'Permission de lire ses propres congés', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.conges.read.team', 'hr.conges', 'read.team', 'Lire congés équipe', 'Permission de lire les congés de son équipe', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.conges.read.all', 'hr.conges', 'read.all', 'Lire tous les congés', 'Permission de lire tous les congés', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.conges.manage', 'hr.conges', 'manage', 'Gérer les congés', 'Permission de gérer et valider les congés', 'hr', false, NOW())
ON CONFLICT DO NOTHING;

-- Documents RH
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.documents.read', 'hr.documents', 'read', 'Lire les documents', 'Permission de lire les documents RH', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.documents.read.own', 'hr.documents', 'read.own', 'Lire ses documents', 'Permission de lire ses propres documents', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.documents.read.team', 'hr.documents', 'read.team', 'Lire documents équipe', 'Permission de lire les documents de son équipe', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.documents.read.all', 'hr.documents', 'read.all', 'Lire tous les documents', 'Permission de lire tous les documents RH', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.documents.write', 'hr.documents', 'write', 'Modifier les documents', 'Permission de modifier les documents RH', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.documents.upload', 'hr.documents', 'upload', 'Uploader des documents', 'Permission d''uploader des documents RH', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.documents.sign', 'hr.documents', 'sign', 'Signer des documents', 'Permission de signer des documents RH', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.documents.delete', 'hr.documents', 'delete', 'Supprimer des documents', 'Permission de supprimer des documents RH', 'hr', true, NOW())
ON CONFLICT DO NOTHING;

-- Vie interne
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.internal-life.read', 'hr.internal-life', 'read', 'Lire vie interne', 'Permission de lire les événements internes', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.internal-life.read.own', 'hr.internal-life', 'read.own', 'Lire ses événements', 'Permission de lire ses propres événements', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.internal-life.read.all', 'hr.internal-life', 'read.all', 'Lire tous les événements', 'Permission de lire tous les événements internes', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.internal-life.write', 'hr.internal-life', 'write', 'Créer des événements', 'Permission de créer des événements internes', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.internal-life.manage', 'hr.internal-life', 'manage', 'Gérer vie interne', 'Permission de gérer tous les événements internes', 'hr', false, NOW())
ON CONFLICT DO NOTHING;

-- Gardien
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.guardian.read', 'hr.guardian', 'read', 'Lire réponses gardien', 'Permission de lire ses réponses gardien', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.guardian.read.all', 'hr.guardian', 'read.all', 'Lire toutes les réponses', 'Permission de lire toutes les réponses gardien', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.guardian.write', 'hr.guardian', 'write', 'Soumettre réponses', 'Permission de soumettre ses réponses gardien', 'hr', true, NOW())
ON CONFLICT DO NOTHING;

-- Permissions & Rôles
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.permissions.manage', 'hr.permissions', 'manage', 'Gérer les permissions', 'Permission de gérer les rôles et permissions RH', 'hr', false, NOW())
ON CONFLICT DO NOTHING;

-- Organisations
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.organizations.read', 'hr.organizations', 'read', 'Lire les organisations', 'Permission de lire les organisations', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.organizations.read.own', 'hr.organizations', 'read.own', 'Lire son organisation', 'Permission de lire son organisation', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.organizations.read.all', 'hr.organizations', 'read.all', 'Lire toutes les organisations', 'Permission de lire toutes les organisations', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.organizations.write', 'hr.organizations', 'write', 'Modifier les organisations', 'Permission de modifier les organisations', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.organizations.write.own', 'hr.organizations', 'write.own', 'Modifier son organisation', 'Permission de modifier son organisation', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.organizations.write.all', 'hr.organizations', 'write.all', 'Modifier toutes les organisations', 'Permission de modifier toutes les organisations', 'hr', false, NOW()),
(gen_random_uuid(), 'hr.organizations.create', 'hr.organizations', 'create', 'Créer des organisations', 'Permission de créer des organisations', 'hr', true, NOW()),
(gen_random_uuid(), 'hr.organizations.delete', 'hr.organizations', 'delete', 'Supprimer des organisations', 'Permission de supprimer des organisations', 'hr', true, NOW())
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PERMISSIONS PROJETS
-- =============================================================================

INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
-- Projets
(gen_random_uuid(), 'project.create', 'project', 'create', 'Créer des projets', 'Permission de créer des projets', 'projects', true, NOW()),
(gen_random_uuid(), 'project.read', 'project', 'read', 'Lire les projets', 'Permission de lire les projets', 'projects', true, NOW()),
(gen_random_uuid(), 'project.read.own', 'project', 'read.own', 'Lire ses projets', 'Permission de lire ses propres projets', 'projects', false, NOW()),
(gen_random_uuid(), 'project.read.all', 'project', 'read.all', 'Lire tous les projets', 'Permission de lire tous les projets', 'projects', false, NOW()),
(gen_random_uuid(), 'project.edit', 'project', 'edit', 'Modifier les projets', 'Permission de modifier les projets', 'projects', true, NOW()),
(gen_random_uuid(), 'project.edit.own', 'project', 'edit.own', 'Modifier ses projets', 'Permission de modifier ses propres projets', 'projects', false, NOW()),
(gen_random_uuid(), 'project.delete', 'project', 'delete', 'Supprimer des projets', 'Permission de supprimer des projets', 'projects', true, NOW()),
(gen_random_uuid(), 'project.export', 'project', 'export', 'Exporter les projets', 'Permission d''exporter les projets', 'projects', false, NOW()),
-- Tâches
(gen_random_uuid(), 'project.task.create', 'project.task', 'create', 'Créer des tâches', 'Permission de créer des tâches', 'projects', true, NOW()),
(gen_random_uuid(), 'project.task.read', 'project.task', 'read', 'Lire les tâches', 'Permission de lire les tâches', 'projects', true, NOW()),
(gen_random_uuid(), 'project.task.edit', 'project.task', 'edit', 'Modifier les tâches', 'Permission de modifier les tâches', 'projects', true, NOW()),
(gen_random_uuid(), 'project.task.delete', 'project.task', 'delete', 'Supprimer des tâches', 'Permission de supprimer des tâches', 'projects', true, NOW()),
(gen_random_uuid(), 'project.task.manage', 'project.task', 'manage', 'Gérer les tâches', 'Permission de gérer toutes les tâches', 'projects', false, NOW()),
(gen_random_uuid(), 'project.task.assign', 'project.task', 'assign', 'Assigner des tâches', 'Permission d''assigner des tâches', 'projects', false, NOW()),
-- Workflow
(gen_random_uuid(), 'project.workflow.validate', 'project.workflow', 'validate', 'Valider le workflow', 'Permission de valider les workflows', 'projects', false, NOW()),
(gen_random_uuid(), 'project.workflow.manage', 'project.workflow', 'manage', 'Gérer le workflow', 'Permission de gérer les workflows', 'projects', false, NOW()),
-- Membres
(gen_random_uuid(), 'project.members.read', 'project.members', 'read', 'Lire les membres', 'Permission de lire les membres de projet', 'projects', true, NOW()),
(gen_random_uuid(), 'project.members.read.all', 'project.members', 'read.all', 'Lire tous les membres', 'Permission de lire tous les membres de tous les projets', 'projects', false, NOW()),
(gen_random_uuid(), 'project.members.add', 'project.members', 'add', 'Ajouter des membres', 'Permission d''ajouter des membres à un projet', 'projects', false, NOW()),
(gen_random_uuid(), 'project.members.remove', 'project.members', 'remove', 'Retirer des membres', 'Permission de retirer des membres d''un projet', 'projects', false, NOW()),
-- Rapports
(gen_random_uuid(), 'project.reports.read', 'project.reports', 'read', 'Lire les rapports', 'Permission de lire les rapports de projet', 'projects', true, NOW()),
(gen_random_uuid(), 'project.reports.export', 'project.reports', 'export', 'Exporter les rapports', 'Permission d''exporter les rapports de projet', 'projects', false, NOW()),
-- Settings
(gen_random_uuid(), 'project.settings.manage', 'project.settings', 'manage', 'Gérer les paramètres', 'Permission de gérer les paramètres de projet', 'projects', false, NOW())
ON CONFLICT DO NOTHING;
 
-- Utilisateurs
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'user.read', 'user', 'read', 'Lire les utilisateurs', 'Permission de lire les utilisateurs', 'core', true, NOW()),
(gen_random_uuid(), 'user.read.own', 'user', 'read.own', 'Lire son profil', 'Permission de lire son propre profil utilisateur', 'core', false, NOW()),
(gen_random_uuid(), 'user.read.all', 'user', 'read.all', 'Lire tous les utilisateurs', 'Permission de lire tous les utilisateurs', 'core', false, NOW()),
(gen_random_uuid(), 'user.write', 'user', 'write', 'Modifier les utilisateurs', 'Permission de modifier les utilisateurs', 'core', true, NOW()),
(gen_random_uuid(), 'user.write.own', 'user', 'write.own', 'Modifier son profil', 'Permission de modifier son propre profil', 'core', false, NOW()),
(gen_random_uuid(), 'user.manage', 'user', 'manage', 'Gérer les utilisateurs', 'Permission de gérer tous les utilisateurs', 'core', false, NOW()),
(gen_random_uuid(), 'user.delete', 'user', 'delete', 'Supprimer des utilisateurs', 'Permission de supprimer des utilisateurs', 'core', true, NOW()),
(gen_random_uuid(), 'user.impersonate', 'user', 'impersonate', 'Impersonner', 'Permission de se connecter en tant qu''un autre utilisateur', 'core', false, NOW())
ON CONFLICT DO NOTHING;

-- Rôles
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'role.read', 'role', 'read', 'Lire les rôles', 'Permission de lire les rôles', 'core', true, NOW()),
(gen_random_uuid(), 'role.read.all', 'role', 'read.all', 'Lire tous les rôles', 'Permission de lire tous les rôles', 'core', false, NOW()),
(gen_random_uuid(), 'role.create', 'role', 'create', 'Créer des rôles', 'Permission de créer des rôles', 'core', true, NOW()),
(gen_random_uuid(), 'role.edit', 'role', 'edit', 'Modifier les rôles', 'Permission de modifier les rôles', 'core', true, NOW()),
(gen_random_uuid(), 'role.delete', 'role', 'delete', 'Supprimer des rôles', 'Permission de supprimer des rôles', 'core', true, NOW()),
(gen_random_uuid(), 'role.assign', 'role', 'assign', 'Assigner des rôles', 'Permission d''assigner des rôles aux utilisateurs', 'core', false, NOW()),
(gen_random_uuid(), 'role.permissions.manage', 'role.permissions', 'manage', 'Gérer permissions rôles', 'Permission de gérer les permissions des rôles', 'core', false, NOW())
ON CONFLICT DO NOTHING;

-- Système
INSERT INTO core.permissions (id, code, resource, action, display_name, description, system_module_code, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'system.admin', 'system', 'admin', 'Admin système', 'Accès administrateur complet', 'core', false, NOW()),
(gen_random_uuid(), 'system.config', 'system', 'config', 'Configuration système', 'Permission de configurer le système', 'core', false, NOW()),
(gen_random_uuid(), 'system.audit', 'system', 'audit', 'Audit système', 'Permission de voir les logs d''audit', 'core', false, NOW()),
(gen_random_uuid(), 'system.backup', 'system', 'backup', 'Sauvegardes', 'Permission de gérer les sauvegardes', 'core', false, NOW())
ON CONFLICT DO NOTHING;
 
-- Fonction pour assigner une permission à un rôle par code
CREATE OR REPLACE FUNCTION assign_permission_to_role(role_code TEXT, perm_code TEXT)
RETURNS void AS $$
DECLARE
    role_id UUID;
    perm_id UUID;
BEGIN
    SELECT id INTO role_id FROM core.roles WHERE code = role_code;
    SELECT id INTO perm_id FROM core.permissions WHERE code = perm_code;
    
    IF role_id IS NOT NULL AND perm_id IS NOT NULL THEN
        INSERT INTO core.role_permissions (id, role_id, permission_id)
        VALUES (gen_random_uuid(), role_id, perm_id)
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Assigner toutes les permissions au SUPER_ADMIN
DO $$
DECLARE
    perm RECORD;
    role_id UUID;
BEGIN
    SELECT id INTO role_id FROM core.roles WHERE code = 'SUPER_ADMIN';
    
    IF role_id IS NOT NULL THEN
        FOR perm IN SELECT id FROM core.permissions LOOP
            INSERT INTO core.role_permissions (id, role_id, permission_id)
            VALUES (gen_random_uuid(), role_id, perm.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
END $$;

-- Assigner les permissions ORG_ADMIN (toutes HR + projets + gestion utilisateurs)
DO $$
DECLARE
    perm RECORD;
    role_id UUID;
BEGIN
    SELECT id INTO role_id FROM core.roles WHERE code = 'ORG_ADMIN';
    
    IF role_id IS NOT NULL THEN
        FOR perm IN SELECT id FROM core.permissions 
        WHERE system_module_code IN ('hr', 'projects', 'core')
        AND code NOT LIKE 'system.%'
        LOOP
            INSERT INTO core.role_permissions (id, role_id, permission_id)
            VALUES (gen_random_uuid(), role_id, perm.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
END $$;

-- Assigner les permissions HR_MANAGER
DO $$
DECLARE
    perm RECORD;
    role_id UUID;
BEGIN
    SELECT id INTO role_id FROM core.roles WHERE code = 'HR_MANAGER';
    
    IF role_id IS NOT NULL THEN
        -- Toutes les permissions HR
        FOR perm IN SELECT id FROM core.permissions WHERE system_module_code = 'hr' LOOP
            INSERT INTO core.role_permissions (id, role_id, permission_id)
            VALUES (gen_random_uuid(), role_id, perm.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
        -- + Lecture projets
        FOR perm IN SELECT id FROM core.permissions 
        WHERE system_module_code = 'projects' AND action LIKE 'read%' LOOP
            INSERT INTO core.role_permissions (id, role_id, permission_id)
            VALUES (gen_random_uuid(), role_id, perm.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
END $$;

-- Assigner les permissions EMPLOYEE (lecture propre + pointage)
DO $$
DECLARE
    role_id UUID;
BEGIN
    SELECT id INTO role_id FROM core.roles WHERE code = 'EMPLOYEE';
    
    IF role_id IS NOT NULL THEN
        -- Permissions de base employé
        PERFORM assign_permission_to_role('EMPLOYEE', 'hr.employees.read.own');
        PERFORM assign_permission_to_role('EMPLOYEE', 'hr.employees.write.own');
        PERFORM assign_permission_to_role('EMPLOYEE', 'hr.attendance.read.own');
        PERFORM assign_permission_to_role('EMPLOYEE', 'hr.attendance.write');
        PERFORM assign_permission_to_role('EMPLOYEE', 'hr.conges.read.own');
        PERFORM assign_permission_to_role('EMPLOYEE', 'hr.documents.read.own');
        PERFORM assign_permission_to_role('EMPLOYEE', 'hr.documents.sign');
        PERFORM assign_permission_to_role('EMPLOYEE', 'hr.guardian.read');
        PERFORM assign_permission_to_role('EMPLOYEE', 'hr.guardian.write');
        PERFORM assign_permission_to_role('EMPLOYEE', 'hr.internal-life.read');
        PERFORM assign_permission_to_role('EMPLOYEE', 'user.read.own');
        PERFORM assign_permission_to_role('EMPLOYEE', 'user.write.own');
        PERFORM assign_permission_to_role('EMPLOYEE', 'project.read.own');
        PERFORM assign_permission_to_role('EMPLOYEE', 'project.task.read');
        PERFORM assign_permission_to_role('EMPLOYEE', 'project.task.create');
    END IF;
END $$;

-- Nettoyer la fonction temporaire
DROP FUNCTION IF EXISTS assign_permission_to_role(TEXT, TEXT);

-- Confirmation
SELECT 'Permissions seeded successfully!' AS status, 
       (SELECT COUNT(*) FROM core.permissions) AS total_permissions,
       (SELECT COUNT(*) FROM core.role_permissions) AS total_role_assignments;
