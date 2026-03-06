-- Migration: Mettre à jour les workflows existants vers 3 étapes en français
-- Date: 2026-03-05
-- Version corrigée avec gestion des contraintes FK

BEGIN;

-- 1. Supprimer d'abord les validations de workflow qui référencent les étapes
DELETE FROM module_b_projects.task_workflow_validations
WHERE step_id IN (
  SELECT pws.id FROM module_b_projects.project_workflow_steps pws
  JOIN module_b_projects.project_workflows pw ON pw.id = pws.workflow_id
  WHERE pw.is_default = true
);

-- 2. Supprimer les demandes de validation qui référencent les étapes
DELETE FROM module_b_projects.validation_requests
WHERE step_id IN (
  SELECT pws.id FROM module_b_projects.project_workflow_steps pws
  JOIN module_b_projects.project_workflows pw ON pw.id = pws.workflow_id
  WHERE pw.is_default = true
);

-- 3. Maintenant supprimer les étapes existantes des workflows par défaut
DELETE FROM module_b_projects.project_workflow_steps 
WHERE workflow_id IN (
  SELECT id FROM module_b_projects.project_workflows WHERE is_default = true
);

-- 3. Insérer les nouvelles étapes pour chaque workflow par défaut
INSERT INTO module_b_projects.project_workflow_steps (id, workflow_id, name, step_order, requires_validation, validator_role, is_final_step, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  pw.id,
  'À faire',
  0,
  false,
  NULL,
  false,
  NOW(),
  NOW()
FROM module_b_projects.project_workflows pw
WHERE pw.is_default = true;

INSERT INTO module_b_projects.project_workflow_steps (id, workflow_id, name, step_order, requires_validation, validator_role, is_final_step, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  pw.id,
  'En cours',
  1,
  false,
  NULL,
  false,
  NOW(),
  NOW()
FROM module_b_projects.project_workflows pw
WHERE pw.is_default = true;

INSERT INTO module_b_projects.project_workflow_steps (id, workflow_id, name, step_order, requires_validation, validator_role, is_final_step, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  pw.id,
  'Terminé',
  2,
  true,
  'MANAGER_OR_OWNER',
  true,
  NOW(),
  NOW()
FROM module_b_projects.project_workflows pw
WHERE pw.is_default = true;

-- 4. Mettre à jour les current_step_id des tâches
-- D'abord, créer une table temporaire pour mapper les anciennes étapes aux nouvelles
-- Les tâches en Draft/Review -> première étape (À faire)
-- Les tâches en Approved -> deuxième étape (En cours)
-- Les tâches en Done -> troisième étape (Terminé)

-- Mettre à jour les tâches en fonction de leur statut actuel
UPDATE module_b_projects.tasks t
SET current_step_id = (
  SELECT pws.id 
  FROM module_b_projects.project_workflow_steps pws
  JOIN module_b_projects.project_workflows pw ON pw.id = pws.workflow_id
  WHERE pw.project_id = t.project_id 
    AND pw.is_default = true 
    AND pws.step_order = 0
),
status = CASE 
  WHEN t.status IN ('todo', 'draft', 'review') THEN 'todo'
  WHEN t.status IN ('in_progress', 'approved') THEN 'in_progress'
  WHEN t.status IN ('completed', 'done') THEN 'completed'
  ELSE t.status
END
WHERE t.current_step_id IN (
  SELECT pws.id FROM module_b_projects.project_workflow_steps pws
  WHERE pws.name IN ('Draft', 'Review')
);

UPDATE module_b_projects.tasks t
SET current_step_id = (
  SELECT pws.id 
  FROM module_b_projects.project_workflow_steps pws
  JOIN module_b_projects.project_workflows pw ON pw.id = pws.workflow_id
  WHERE pw.project_id = t.project_id 
    AND pw.is_default = true 
    AND pws.step_order = 1
),
status = 'in_progress'
WHERE t.current_step_id IN (
  SELECT pws.id FROM module_b_projects.project_workflow_steps pws
  WHERE pws.name = 'Approved'
);

UPDATE module_b_projects.tasks t
SET current_step_id = (
  SELECT pws.id 
  FROM module_b_projects.project_workflow_steps pws
  JOIN module_b_projects.project_workflows pw ON pw.id = pws.workflow_id
  WHERE pw.project_id = t.project_id 
    AND pw.is_default = true 
    AND pws.step_order = 2
),
status = 'completed'
WHERE t.current_step_id IN (
  SELECT pws.id FROM module_b_projects.project_workflow_steps pws
  WHERE pws.name = 'Done'
);

COMMIT;
