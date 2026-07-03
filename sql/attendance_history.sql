SELECT 
    a.id,
    a.attendance_date AS date,
    CONCAT(u.first_name, ' ', u.last_name) AS employe,
    d.name AS departement,
    a.scheduled_check_in AS heure_prevue_arrivee,
    a.scheduled_check_out AS heure_prevue_depart,
    a.actual_check_in AS arrivee,
    a.actual_check_out AS depart,
    CASE 
        WHEN a.actual_check_in IS NOT NULL AND a.actual_check_out IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (a.actual_check_out::time - a.actual_check_in::time)) / 3600
        ELSE NULL 
    END AS heures_travaillees,
    a.status,
    a.is_justified AS justifie,
    a.notes
FROM module_c_rh.office_attendances a
JOIN module_c_rh.employees e ON a.employee_id = e.id
JOIN core.users u ON e.user_id = u.id
LEFT JOIN module_c_rh.departments d ON e.department_id = d.id
WHERE a.deleted_at IS NULL
ORDER BY a.attendance_date DESC, u.first_name, u.last_name;

SELECT 
    a.id,
    a.attendance_date AS date,
    a.actual_check_in AS arrivee,
    a.actual_check_out AS depart,
    CASE 
        WHEN a.actual_check_in IS NOT NULL AND a.actual_check_out IS NOT NULL 
        THEN ROUND(EXTRACT(EPOCH FROM (a.actual_check_out::time - a.actual_check_in::time)) / 3600, 2)
        ELSE NULL 
    END AS heures_travaillees,
    a.status,
    a.is_justified AS justifie,
    a.notes
FROM module_c_rh.office_attendances a
WHERE a.employee_id = '2b409f4c-7594-4bb8-9a74-2d672092ed3'
  AND a.deleted_at IS NULL
ORDER BY a.attendance_date DESC;
 
SELECT 
    a.id,
    a.attendance_date AS date,
    CONCAT(u.first_name, ' ', u.last_name) AS employe,
    a.actual_check_in AS arrivee,
    a.actual_check_out AS depart,
    CASE 
        WHEN a.actual_check_in IS NOT NULL AND a.actual_check_out IS NOT NULL 
        THEN ROUND(EXTRACT(EPOCH FROM (a.actual_check_out::time - a.actual_check_in::time)) / 3600, 2)
        ELSE NULL 
    END AS heures_travaillees,
    a.status
FROM module_c_rh.office_attendances a
JOIN module_c_rh.employees e ON a.employee_id = e.id
JOIN core.users u ON e.user_id = u.id
LEFT JOIN module_c_rh.departments d ON e.department_id = d.id
WHERE d.name = 'DEPARTMENT_NAME'  -- Remplacer par le nom du département
  AND a.deleted_at IS NULL
ORDER BY a.attendance_date DESC, u.first_name;

-- 4. Statistiques mensuelles par employé
SELECT 
    CONCAT(u.first_name, ' ', u.last_name) AS employe,
    d.name AS departement,
    COUNT(*) AS total_jours,
    SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS jours_presents,
    SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS jours_absents,
    SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS jours_retard,
    ROUND(AVG(
        CASE 
            WHEN a.actual_check_in IS NOT NULL AND a.actual_check_out IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (a.actual_check_out::time - a.actual_check_in::time)) / 3600
            ELSE NULL 
        END
    ), 2) AS moyenne_heures_jour
FROM module_c_rh.office_attendances a
JOIN module_c_rh.employees e ON a.employee_id = e.id
JOIN core.users u ON e.user_id = u.id
LEFT JOIN module_c_rh.departments d ON e.department_id = d.id
WHERE a.attendance_date >= DATE_TRUNC('month', CURRENT_DATE)
  AND a.deleted_at IS NULL
GROUP BY u.first_name, u.last_name, d.name
ORDER BY d.name, u.first_name;

-- 5. Retards du mois (pour suivi discipline)
SELECT 
    CONCAT(u.first_name, ' ', u.last_name) AS employe,
    d.name AS departement,
    COUNT(*) AS nombre_retards,
    STRING_AGG(TO_CHAR(a.attendance_date, 'DD/MM/YYYY'), ', ') AS dates_retards
FROM module_c_rh.office_attendances a
JOIN module_c_rh.employees e ON a.employee_id = e.id
JOIN core.users u ON e.user_id = u.id
LEFT JOIN module_c_rh.departments d ON e.department_id = d.id
WHERE a.status = 'late'
  AND a.attendance_date >= DATE_TRUNC('month', CURRENT_DATE)
  AND a.deleted_at IS NULL
GROUP BY u.first_name, u.last_name, d.name
ORDER BY nombre_retards DESC;

-- 6. Vue résumée pour les admins (derniers 30 jours)
SELECT 
    a.attendance_date AS date,
    CONCAT(u.first_name, ' ', u.last_name) AS employe,
    d.name AS departement,
    e.work_start_time AS horaire_debut,
    e.work_end_time AS horaire_fin,
    a.actual_check_in AS arrivee_reelle,
    a.actual_check_out AS depart_reel,
    CASE 
        WHEN a.actual_check_in IS NOT NULL AND a.actual_check_out IS NOT NULL 
        THEN CONCAT(
            FLOOR(EXTRACT(EPOCH FROM (a.actual_check_out::time - a.actual_check_in::time)) / 3600), 'h',
            ROUND(EXTRACT(EPOCH FROM (a.actual_check_out::time - a.actual_check_in::time)) % 3600 / 60), 'min'
        )
        ELSE '-' 
    END AS duree,
    CASE a.status
        WHEN 'present' THEN 'Présent'
        WHEN 'absent' THEN 'Absent'
        WHEN 'late' THEN 'Retard'
        WHEN 'early_leave' THEN 'Départ anticipé'
        WHEN 'partial' THEN 'Partiel'
        ELSE a.status
    END AS statut
FROM module_c_rh.office_attendances a
JOIN module_c_rh.employees e ON a.employee_id = e.id
JOIN core.users u ON e.user_id = u.id
LEFT JOIN module_c_rh.departments d ON e.department_id = d.id
WHERE a.attendance_date >= CURRENT_DATE - INTERVAL '30 days'
  AND a.deleted_at IS NULL
ORDER BY a.attendance_date DESC, d.name, u.first_name;

-- 7. Vérifier les tables disponibles dans le schéma RH
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'module_c_rh'
ORDER BY table_name;
