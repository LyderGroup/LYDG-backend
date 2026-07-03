INSERT INTO module_c_rh.employee_required_documents (
    employee_id,
    organization_id,
    document_type,
    status,
    is_optional,
    due_date,
    created_at,
    updated_at
)
SELECT 
    e.id,
    e.organization_id,
    doc.type,
    'pending',
    doc.is_optional,
    e.contract_start_date + INTERVAL '1 day' * doc.days,
    NOW(),
    NOW()
FROM module_c_rh.employees e
CROSS JOIN (VALUES
    ('birth_certificate', false, 30),
    ('id_photo', false, 15),
    ('id_copy', false, 15),
    ('cv', false, 7),
    ('cover_letter', false, 7),
    ('diploma', false, 30),
    ('work_certificate', true, 30),
    ('criminal_record', false, 30),
    ('cnss_number', true, 30),
    ('info_form', false, 7)
) AS doc(type, is_optional, days)
WHERE e.employment_status = 'active'
AND NOT EXISTS (
    SELECT 1 FROM module_c_rh.employee_required_documents erd 
    WHERE erd.employee_id = e.id AND erd.document_type = doc.type
);

-- Vérification
SELECT 
    e.employee_number,
    e.id as employee_id,
    COUNT(erd.id) as documents_count,
    SUM(CASE WHEN erd.status = 'pending' THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN erd.status = 'validated' THEN 1 ELSE 0 END) as validated,
    SUM(CASE WHEN erd.due_date < NOW() AND erd.status != 'validated' THEN 1 ELSE 0 END) as overdue
FROM module_c_rh.employees e
LEFT JOIN module_c_rh.employee_required_documents erd ON e.id = erd.employee_id
WHERE e.employment_status = 'active'
GROUP BY e.employee_number, e.id
ORDER BY overdue DESC;
