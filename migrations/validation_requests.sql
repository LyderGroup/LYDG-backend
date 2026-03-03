CREATE TABLE IF NOT EXISTS module_b_projects.validation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES module_b_projects.tasks(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES module_b_projects.project_workflow_steps(id),
    project_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    requester_id UUID NOT NULL REFERENCES core.users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    message TEXT,
    validated_by UUID REFERENCES core.users(id),
    validator_comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    validated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_validation_requests_task_step ON module_b_projects.validation_requests(task_id, step_id);
CREATE INDEX IF NOT EXISTS idx_validation_requests_project_status ON module_b_projects.validation_requests(project_id, status);
CREATE INDEX IF NOT EXISTS idx_validation_requests_organization ON module_b_projects.validation_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_validation_requests_requester ON module_b_projects.validation_requests(requester_id);

COMMENT ON TABLE module_b_projects.validation_requests IS 'Stores validation requests from task assignees to project managers/owners';
COMMENT ON COLUMN module_b_projects.validation_requests.status IS 'pending = waiting for validation, approved = validated, rejected = rejected';
COMMENT ON COLUMN module_b_projects.validation_requests.message IS 'Optional message from the requester explaining why validation is needed';
