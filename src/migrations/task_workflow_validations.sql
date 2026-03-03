-- Migration: task_workflow_validations
-- Description: Create table for tracking workflow validation decisions

-- Create enum type for validation decision
CREATE TYPE module_b_projects.validation_decision 
  AS ENUM ('approved', 'rejected', 'pending');
 
CREATE TABLE module_b_projects.task_workflow_validations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES module_b_projects.tasks(id) ON DELETE CASCADE,
  step_id         UUID NOT NULL REFERENCES module_b_projects.project_workflow_steps(id),
  organization_id UUID NOT NULL,
  validator_id    UUID NOT NULL,
  decision        module_b_projects.validation_decision NOT NULL DEFAULT 'pending',
  comment         TEXT,
  rejected_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at    TIMESTAMPTZ
);

CREATE INDEX idx_twv_task_step 
  ON module_b_projects.task_workflow_validations(task_id, step_id);

CREATE INDEX idx_twv_org_user 
  ON module_b_projects.task_workflow_validations(organization_id, validator_id);

CREATE INDEX idx_twv_decision 
  ON module_b_projects.task_workflow_validations(decision) 
  WHERE decision = 'pending';

INSERT INTO core.permissions (id, code, system_module_code, resource, action, display_name, description, is_crud_action, created_at)
VALUES 
  (gen_random_uuid(), 'projects.task.validate.project', 'module_b_projects', 'task', 'validate.project', 'Valider tâches projet', 'Permet de valider les étapes de workflow des tâches du projet', false, NOW()),
  (gen_random_uuid(), 'projects.task.validate.global', 'module_b_projects', 'task', 'validate.global', 'Valider toutes tâches', 'Permet de valider les étapes de workflow de toutes les tâches', false, NOW())
ON CONFLICT (code) DO NOTHING;
 
UPDATE module_b_projects.project_workflow_steps
SET requires_validation = true, validator_role = 'MANAGER'
WHERE name ILIKE '%approved%' 
   OR name ILIKE '%validation%' 
   OR name ILIKE '%review%'
   OR name ILIKE '%révision%'; 