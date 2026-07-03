-- Migration: Permissions du module RH
-- Structure: id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at

-- =============================================================================
-- EMPLOYÉS
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.employees.read', 'module_c_rh', 'employees', 'read', 'Voir les employés', 'Permission de lire les informations des employés', true, NOW()),
(gen_random_uuid(), 'hr.employees.read.own', 'module_c_rh', 'employees', 'read.own', 'Voir son propre profil', 'Permission de voir son propre profil employé', false, NOW()),
(gen_random_uuid(), 'hr.employees.read.team', 'module_c_rh', 'employees', 'read.team', 'Voir son équipe', 'Permission de voir les employés de son équipe', false, NOW()),
(gen_random_uuid(), 'hr.employees.read.all', 'module_c_rh', 'employees', 'read.all', 'Voir tous les employés', 'Permission de voir tous les employés de l organisation', false, NOW()),
(gen_random_uuid(), 'hr.employees.write', 'module_c_rh', 'employees', 'write', 'Créer/modifier les employés', 'Permission de créer et modifier les employés', true, NOW()),
(gen_random_uuid(), 'hr.employees.write.own', 'module_c_rh', 'employees', 'write.own', 'Modifier son propre profil', 'Permission de modifier son propre profil', false, NOW()),
(gen_random_uuid(), 'hr.employees.write.team', 'module_c_rh', 'employees', 'write.team', 'Modifier son équipe', 'Permission de modifier les employés de son équipe', false, NOW()),
(gen_random_uuid(), 'hr.employees.write.all', 'module_c_rh', 'employees', 'write.all', 'Modifier tous les employés', 'Permission de modifier tous les employés', false, NOW()),
(gen_random_uuid(), 'hr.employees.delete', 'module_c_rh', 'employees', 'delete', 'Supprimer des employés', 'Permission de supprimer des employés', true, NOW()),
(gen_random_uuid(), 'hr.employees.restore', 'module_c_rh', 'employees', 'restore', 'Restaurer des employés', 'Permission de restaurer des employés supprimés', false, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SALAIRES & PRIMES
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.salary.read', 'module_c_rh', 'salary', 'read', 'Voir les salaires', 'Permission de lire les informations salariales', true, NOW()),
(gen_random_uuid(), 'hr.salary.read.own', 'module_c_rh', 'salary', 'read.own', 'Voir son propre salaire', 'Permission de voir son propre salaire', false, NOW()),
(gen_random_uuid(), 'hr.salary.read.team', 'module_c_rh', 'salary', 'read.team', 'Voir salaires équipe', 'Permission de voir les salaires de son équipe', false, NOW()),
(gen_random_uuid(), 'hr.salary.read.all', 'module_c_rh', 'salary', 'read.all', 'Voir tous les salaires', 'Permission de voir tous les salaires', false, NOW()),
(gen_random_uuid(), 'hr.salary.write', 'module_c_rh', 'salary', 'write', 'Modifier les salaires', 'Permission de modifier les salaires', true, NOW()),
(gen_random_uuid(), 'hr.salary.write.own', 'module_c_rh', 'salary', 'write.own', 'Demander modification salaire', 'Permission de demander une modification de salaire', false, NOW()),
(gen_random_uuid(), 'hr.salary.write.team', 'module_c_rh', 'salary', 'write.team', 'Modifier salaires équipe', 'Permission de modifier les salaires de son équipe', false, NOW()),
(gen_random_uuid(), 'hr.salary.write.all', 'module_c_rh', 'salary', 'write.all', 'Modifier tous les salaires', 'Permission de modifier tous les salaires', false, NOW()),
(gen_random_uuid(), 'hr.salary.export', 'module_c_rh', 'salary', 'export', 'Exporter les salaires', 'Permission d exporter les données salariales', false, NOW()),
(gen_random_uuid(), 'hr.bonus.read', 'module_c_rh', 'bonus', 'read', 'Voir les primes', 'Permission de lire les informations de primes', true, NOW()),
(gen_random_uuid(), 'hr.bonus.write', 'module_c_rh', 'bonus', 'write', 'Attribuer des primes', 'Permission d attribuer des primes', true, NOW()),
(gen_random_uuid(), 'hr.bonus.approve', 'module_c_rh', 'bonus', 'approve', 'Approuver les primes', 'Permission d approuver les primes', false, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- ORGANISATIONS
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.organizations.read', 'module_c_rh', 'organizations', 'read', 'Voir les organisations', 'Permission de lire les organisations', true, NOW()),
(gen_random_uuid(), 'hr.organizations.read.own', 'module_c_rh', 'organizations', 'read.own', 'Voir son organisation', 'Permission de voir son organisation', false, NOW()),
(gen_random_uuid(), 'hr.organizations.read.all', 'module_c_rh', 'organizations', 'read.all', 'Voir toutes les organisations', 'Permission de voir toutes les organisations', false, NOW()),
(gen_random_uuid(), 'hr.organizations.write', 'module_c_rh', 'organizations', 'write', 'Modifier les organisations', 'Permission de modifier les organisations', true, NOW()),
(gen_random_uuid(), 'hr.organizations.write.own', 'module_c_rh', 'organizations', 'write.own', 'Modifier son organisation', 'Permission de modifier son organisation', false, NOW()),
(gen_random_uuid(), 'hr.organizations.write.all', 'module_c_rh', 'organizations', 'write.all', 'Modifier toutes les organisations', 'Permission de modifier toutes les organisations', false, NOW()),
(gen_random_uuid(), 'hr.organizations.create', 'module_c_rh', 'organizations', 'create', 'Créer des organisations', 'Permission de créer des organisations', true, NOW()),
(gen_random_uuid(), 'hr.organizations.delete', 'module_c_rh', 'organizations', 'delete', 'Supprimer des organisations', 'Permission de supprimer des organisations', true, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- VIE INTERNE
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.internal-life.read', 'module_c_rh', 'internal-life', 'read', 'Voir la vie interne', 'Permission de voir la vie interne', true, NOW()),
(gen_random_uuid(), 'hr.internal-life.read.own', 'module_c_rh', 'internal-life', 'read.own', 'Voir ses événements', 'Permission de voir ses événements', false, NOW()),
(gen_random_uuid(), 'hr.internal-life.read.all', 'module_c_rh', 'internal-life', 'read.all', 'Voir tous les événements', 'Permission de voir tous les événements', false, NOW()),
(gen_random_uuid(), 'hr.internal-life.write', 'module_c_rh', 'internal-life', 'write', 'Créer des événements', 'Permission de créer des événements', true, NOW()),
(gen_random_uuid(), 'hr.internal-life.manage', 'module_c_rh', 'internal-life', 'manage', 'Gérer tous les événements', 'Permission de gérer tous les événements', false, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- GARDIEN
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.guardian.read', 'module_c_rh', 'guardian', 'read', 'Voir ses réponses Gardien', 'Permission de voir ses réponses Gardien', true, NOW()),
(gen_random_uuid(), 'hr.guardian.read.all', 'module_c_rh', 'guardian', 'read.all', 'Voir toutes les réponses Gardien', 'Permission de voir toutes les réponses Gardien', false, NOW()),
(gen_random_uuid(), 'hr.guardian.write', 'module_c_rh', 'guardian', 'write', 'Soumettre ses réponses Gardien', 'Permission de soumettre ses réponses Gardien', true, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- POINTAGE
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.attendance.read', 'module_c_rh', 'attendance', 'read', 'Voir les pointages', 'Permission de voir les pointages', true, NOW()),
(gen_random_uuid(), 'hr.attendance.read.own', 'module_c_rh', 'attendance', 'read.own', 'Voir ses pointages', 'Permission de voir ses pointages', false, NOW()),
(gen_random_uuid(), 'hr.attendance.read.team', 'module_c_rh', 'attendance', 'read.team', 'Voir pointages équipe', 'Permission de voir les pointages de son équipe', false, NOW()),
(gen_random_uuid(), 'hr.attendance.read.all', 'module_c_rh', 'attendance', 'read.all', 'Voir tous les pointages', 'Permission de voir tous les pointages', false, NOW()),
(gen_random_uuid(), 'hr.attendance.write', 'module_c_rh', 'attendance', 'write', 'Pointer (check-in/out)', 'Permission de pointer', true, NOW()),
(gen_random_uuid(), 'hr.attendance.justify', 'module_c_rh', 'attendance', 'justify', 'Justifier les absences', 'Permission de justifier les absences', false, NOW()),
(gen_random_uuid(), 'hr.attendance.manage', 'module_c_rh', 'attendance', 'manage', 'Gérer tous les pointages', 'Permission de gérer tous les pointages', false, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- DOCUMENTS RH
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.documents.read', 'module_c_rh', 'documents', 'read', 'Voir les documents RH', 'Permission de voir les documents RH', true, NOW()),
(gen_random_uuid(), 'hr.documents.read.own', 'module_c_rh', 'documents', 'read.own', 'Voir ses documents', 'Permission de voir ses documents', false, NOW()),
(gen_random_uuid(), 'hr.documents.read.team', 'module_c_rh', 'documents', 'read.team', 'Voir documents équipe', 'Permission de voir les documents de son équipe', false, NOW()),
(gen_random_uuid(), 'hr.documents.read.all', 'module_c_rh', 'documents', 'read.all', 'Voir tous les documents', 'Permission de voir tous les documents', false, NOW()),
(gen_random_uuid(), 'hr.documents.write', 'module_c_rh', 'documents', 'write', 'Gérer les documents RH', 'Permission de gérer les documents RH', true, NOW()),
(gen_random_uuid(), 'hr.documents.upload', 'module_c_rh', 'documents', 'upload', 'Uploader des documents', 'Permission d uploader des documents', false, NOW()),
(gen_random_uuid(), 'hr.documents.sign', 'module_c_rh', 'documents', 'sign', 'Signer des documents', 'Permission de signer des documents', false, NOW()),
(gen_random_uuid(), 'hr.documents.delete', 'module_c_rh', 'documents', 'delete', 'Supprimer des documents', 'Permission de supprimer des documents', true, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SANCTIONS
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.sanctions.read', 'module_c_rh', 'sanctions', 'read', 'Voir les sanctions', 'Permission de voir les sanctions', true, NOW()),
(gen_random_uuid(), 'hr.sanctions.read.own', 'module_c_rh', 'sanctions', 'read.own', 'Voir ses sanctions', 'Permission de voir ses sanctions', false, NOW()),
(gen_random_uuid(), 'hr.sanctions.read.all', 'module_c_rh', 'sanctions', 'read.all', 'Voir toutes les sanctions', 'Permission de voir toutes les sanctions', false, NOW()),
(gen_random_uuid(), 'hr.sanctions.write', 'module_c_rh', 'sanctions', 'write', 'Attribuer des sanctions', 'Permission d attribuer des sanctions', true, NOW()),
(gen_random_uuid(), 'hr.sanctions.approve', 'module_c_rh', 'sanctions', 'approve', 'Approuver les sanctions', 'Permission d approuver les sanctions', false, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- FORMATIONS
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.training.read', 'module_c_rh', 'training', 'read', 'Voir les formations', 'Permission de voir les formations', true, NOW()),
(gen_random_uuid(), 'hr.training.read.own', 'module_c_rh', 'training', 'read.own', 'Voir ses formations', 'Permission de voir ses formations', false, NOW()),
(gen_random_uuid(), 'hr.training.read.team', 'module_c_rh', 'training', 'read.team', 'Voir formations équipe', 'Permission de voir les formations de son équipe', false, NOW()),
(gen_random_uuid(), 'hr.training.read.all', 'module_c_rh', 'training', 'read.all', 'Voir toutes les formations', 'Permission de voir toutes les formations', false, NOW()),
(gen_random_uuid(), 'hr.training.write', 'module_c_rh', 'training', 'write', 'Gérer les formations', 'Permission de gérer les formations', true, NOW()),
(gen_random_uuid(), 'hr.training.enroll', 'module_c_rh', 'training', 'enroll', 'S inscrire aux formations', 'Permission de s inscrire aux formations', false, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- ÉVALUATIONS
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.evaluation.read', 'module_c_rh', 'evaluation', 'read', 'Voir les évaluations', 'Permission de voir les évaluations', true, NOW()),
(gen_random_uuid(), 'hr.evaluation.read.own', 'module_c_rh', 'evaluation', 'read.own', 'Voir ses évaluations', 'Permission de voir ses évaluations', false, NOW()),
(gen_random_uuid(), 'hr.evaluation.read.team', 'module_c_rh', 'evaluation', 'read.team', 'Voir évaluations équipe', 'Permission de voir les évaluations de son équipe', false, NOW()),
(gen_random_uuid(), 'hr.evaluation.read.all', 'module_c_rh', 'evaluation', 'read.all', 'Voir toutes les évaluations', 'Permission de voir toutes les évaluations', false, NOW()),
(gen_random_uuid(), 'hr.evaluation.write', 'module_c_rh', 'evaluation', 'write', 'Rédiger des évaluations', 'Permission de rédiger des évaluations', true, NOW()),
(gen_random_uuid(), 'hr.evaluation.validate', 'module_c_rh', 'evaluation', 'validate', 'Valider les évaluations', 'Permission de valider les évaluations', false, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- RECRUTEMENT
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.recruitment.read', 'module_c_rh', 'recruitment', 'read', 'Voir le recrutement', 'Permission de voir le recrutement', true, NOW()),
(gen_random_uuid(), 'hr.recruitment.write', 'module_c_rh', 'recruitment', 'write', 'Gérer les candidatures', 'Permission de gérer les candidatures', true, NOW()),
(gen_random_uuid(), 'hr.recruitment.manage', 'module_c_rh', 'recruitment', 'manage', 'Administrer le recrutement', 'Permission d administrer le recrutement', false, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- CONGÉS
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.leave.read', 'module_c_rh', 'leave', 'read', 'Voir les congés', 'Permission de voir les congés', true, NOW()),
(gen_random_uuid(), 'hr.leave.read.own', 'module_c_rh', 'leave', 'read.own', 'Voir ses congés', 'Permission de voir ses congés', false, NOW()),
(gen_random_uuid(), 'hr.leave.read.team', 'module_c_rh', 'leave', 'read.team', 'Voir congés équipe', 'Permission de voir les congés de son équipe', false, NOW()),
(gen_random_uuid(), 'hr.leave.read.all', 'module_c_rh', 'leave', 'read.all', 'Voir tous les congés', 'Permission de voir tous les congés', false, NOW()),
(gen_random_uuid(), 'hr.leave.write', 'module_c_rh', 'leave', 'write', 'Demander des congés', 'Permission de demander des congés', true, NOW()),
(gen_random_uuid(), 'hr.leave.approve', 'module_c_rh', 'leave', 'approve', 'Approuver les congés', 'Permission d approuver les congés', false, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- PERMISSIONS
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.permissions.manage', 'module_c_rh', 'permissions', 'manage', 'Gérer les permissions RH', 'Permission de gérer les permissions RH', false, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- RITUELS
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.rituals.read', 'module_c_rh', 'rituals', 'read', 'Voir les rituels', 'Permission de voir les rituels', true, NOW()),
(gen_random_uuid(), 'hr.rituals.read.own', 'module_c_rh', 'rituals', 'read.own', 'Voir ses rituels', 'Permission de voir ses rituels', false, NOW()),
(gen_random_uuid(), 'hr.rituals.read.all', 'module_c_rh', 'rituals', 'read.all', 'Voir tous les rituels', 'Permission de voir tous les rituels', false, NOW()),
(gen_random_uuid(), 'hr.rituals.write', 'module_c_rh', 'rituals', 'write', 'Créer des rituels', 'Permission de créer des rituels', true, NOW()),
(gen_random_uuid(), 'hr.rituals.manage', 'module_c_rh', 'rituals', 'manage', 'Gérer tous les rituels', 'Permission de gérer tous les rituels', false, NOW())
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- PARAMÈTRES
-- =============================================================================
INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at) VALUES
(gen_random_uuid(), 'hr.settings.read', 'module_c_rh', 'settings', 'read', 'Voir les paramètres RH', 'Permission de voir les paramètres RH', true, NOW()),
(gen_random_uuid(), 'hr.settings.write', 'module_c_rh', 'settings', 'write', 'Modifier les paramètres RH', 'Permission de modifier les paramètres RH', true, NOW())
ON CONFLICT (code) DO NOTHING;

-- Vérification
SELECT COUNT(*) as hr_permissions_count FROM core.permissions WHERE system_module_code = 'module_c_rh';
