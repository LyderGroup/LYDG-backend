-- Migration: Mettre à jour les workflows existants vers 3 étapes en français
-- Date: 2026-03-05
-- Version corrigée avec gestion des contraintes FK
--
-- IDEMPOTENT : si AU MOINS un workflow par défaut a déjà l'étape 'À faire',
-- on considère la migration appliquée et tout le bloc est skip.
-- Permet aux backends de redémarrer sans réécraser les données.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM module_b_projects.project_workflow_steps pws
    JOIN module_b_projects.project_workflows pw ON pw.id = pws.workflow_id
    WHERE pw.is_default = true AND pws.name = 'À faire'
  ) THEN
    RAISE NOTICE 'update_workflow_3_steps.sql: déjà appliqué, skip.';
    RETURN;
  END IF;

  -- 1. Supprimer les validations de workflow qui référencent les étapes
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

  -- 3. Supprimer les étapes existantes des workflows par défaut
  --    (la FK tasks.current_step_id est ON DELETE SET NULL, donc on est safe)
  DELETE FROM module_b_projects.project_workflow_steps
  WHERE workflow_id IN (
    SELECT id FROM module_b_projects.project_workflows WHERE is_default = true
  );

  -- 4. Insérer les 3 nouvelles étapes pour chaque workflow par défaut
  INSERT INTO module_b_projects.project_workflow_steps
    (id, workflow_id, name, step_order, requires_validation, validator_role, is_final_step, created_at, updated_at)
  SELECT gen_random_uuid(), pw.id, 'À faire', 0, false, NULL, false, NOW(), NOW()
  FROM module_b_projects.project_workflows pw WHERE pw.is_default = true;

  INSERT INTO module_b_projects.project_workflow_steps
    (id, workflow_id, name, step_order, requires_validation, validator_role, is_final_step, created_at, updated_at)
  SELECT gen_random_uuid(), pw.id, 'En cours', 1, false, NULL, false, NOW(), NOW()
  FROM module_b_projects.project_workflows pw WHERE pw.is_default = true;

  INSERT INTO module_b_projects.project_workflow_steps
    (id, workflow_id, name, step_order, requires_validation, validator_role, is_final_step, created_at, updated_at)
  SELECT gen_random_uuid(), pw.id, 'Terminé', 2, true, 'MANAGER_OR_OWNER', true, NOW(), NOW()
  FROM module_b_projects.project_workflows pw WHERE pw.is_default = true;

  -- 5. Recoller les tasks orphelines (current_step_id NULL après l'étape 3)
  --    sur l'étape 'À faire' de leur workflow par défaut.
  UPDATE module_b_projects.tasks t
  SET current_step_id = (
    SELECT pws.id
    FROM module_b_projects.project_workflow_steps pws
    JOIN module_b_projects.project_workflows pw ON pw.id = pws.workflow_id
    WHERE pw.project_id = t.project_id
      AND pw.is_default = true
      AND pws.step_order = 0
    LIMIT 1
  )
  WHERE t.current_step_id IS NULL;

  -- 6. Normaliser le statut sur les valeurs cibles (todo/in_progress/completed)
  UPDATE module_b_projects.tasks
  SET status = CASE
    WHEN status IN ('todo', 'draft', 'review') THEN 'todo'
    WHEN status IN ('in_progress', 'approved') THEN 'in_progress'
    WHEN status IN ('completed', 'done') THEN 'completed'
    ELSE status
  END
  WHERE status IN ('draft', 'review', 'approved', 'done');

  RAISE NOTICE 'update_workflow_3_steps.sql: appliqué avec succès.';
END $$;
