-- Migration: Ajouter les permissions pour les documents obligatoires

-- Insérer les nouvelles permissions avec la bonne structure
INSERT INTO core.permissions (system_module_code, resource, action, display_name, description, is_crud_action, code)
VALUES 
  ('hr', 'required_documents', 'read.own', 'Voir ses documents', 'Voir ses propres documents obligatoires', false, 'hr.required_documents.read.own'),
  ('hr', 'required_documents', 'upload', 'Uploader documents', 'Uploader ses documents obligatoires', false, 'hr.required_documents.upload'),
  ('hr', 'required_documents', 'read.all', 'Voir tous les documents', 'Voir les documents obligatoires de tous les employés', false, 'hr.required_documents.read.all'),
  ('hr', 'required_documents', 'validate', 'Valider documents', 'Valider ou rejeter les documents obligatoires', false, 'hr.required_documents.validate'),
  ('hr', 'required_documents', 'manage', 'Gérer documents', 'Configurer les types de documents obligatoires', false, 'hr.required_documents.manage')
ON CONFLICT (code) DO NOTHING;

-- Assigner les permissions de base à tous les employés (via le rôle EMPLOYEE)
-- Note: Adapter le rôle_id selon votre configuration
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r
CROSS JOIN core.permissions p
WHERE r.name = 'EMPLOYEE' 
  AND p.code IN ('hr.required_documents.read.own', 'hr.required_documents.upload')
ON CONFLICT DO NOTHING;

-- Assigner les permissions RH au rôle HR_ASSISTANT



INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r
CROSS JOIN core.permissions p
WHERE r.name = 'HR_ASSISTANT' 
  AND p.code IN ('hr.required_documents.read.all', 'hr.required_documents.validate')
ON CONFLICT DO NOTHING;

-- Assigner les permissions admin RH au rôle HR_MANAGER
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM core.roles r
CROSS JOIN core.permissions p
WHERE r.name = 'HR_MANAGER' 
  AND p.code IN ('hr.required_documents.read.all', 'hr.required_documents.validate', 'hr.required_documents.manage')
ON CONFLICT DO NOTHING;

-- Vérification
SELECT 
    p.code,
    p.description,
    COUNT(rp.role_id) as roles_assigned
FROM core.permissions p
LEFT JOIN core.role_permissions rp ON p.id = rp.permission_id
WHERE p.code LIKE 'hr.required_documents%'
GROUP BY p.code, p.description
ORDER BY p.code;
