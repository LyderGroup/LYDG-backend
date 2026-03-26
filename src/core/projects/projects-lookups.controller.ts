import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RolesGuard } from '../rbac/roles.guard';
import { InAppNotificationService } from '../notifications/in-app-notification.service';

@UseGuards(RolesGuard)
@Controller('core/projects/lookups')
export class ProjectsLookupsController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notificationService: InAppNotificationService,
  ) { }

  private normalizeUuidList(input: unknown): string[] {
    const arr = Array.isArray(input) ? input : [];
    return arr
      .map((x) => String(x ?? '').trim())
      .filter((x) => x.length > 0);
  }

  private uniqueStrings(list: string[]): string[] {
    return Array.from(new Set(list.map((x) => String(x))));
  }

  private async resolveAccessibleOrganizationIdsForUser(userId: string): Promise<string[]> {
    const system = (await this.dataSource.query(
      `
      SELECT 1 AS ok
      FROM core.user_roles ur
      INNER JOIN core.roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND r.is_active = true
        AND r.is_system_role = true
      LIMIT 1
      `,
      [userId],
    )) as Array<{ ok?: number }>;

    if (system?.[0]?.ok) {
      const orgs = (await this.dataSource.query(
        `
        SELECT o.id
        FROM core.organizations o
        WHERE o.is_active = true
        ORDER BY o.created_at DESC
        LIMIT 500
        `,
      )) as Array<{ id: string }>;
      return orgs.map((o) => o.id);
    }

    const direct = (await this.dataSource.query(
      `
      SELECT DISTINCT r.organization_id AS id
      FROM core.user_roles ur
      INNER JOIN core.roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND r.is_active = true
        AND r.organization_id IS NOT NULL
      `,
      [userId],
    )) as Array<{ id: string }>;

    const directIds = direct.map((r) => r.id).filter(Boolean);
    if (!directIds.length) return [];

    const children = (await this.dataSource.query(
      `
      SELECT o.id
      FROM core.organizations o
      WHERE o.is_active = true
        AND o.parent_org_id = ANY($1::uuid[])
      ORDER BY o.created_at DESC
      LIMIT 500
      `,
      [directIds],
    )) as Array<{ id: string }>;

    return this.uniqueStrings([...directIds, ...children.map((c) => c.id)]);
  }

  private assertValidDateOrNull(input: any): string | null {
    if (input === null || input === undefined || String(input).trim() === '') return null;
    const str = String(input).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      throw new BadRequestException('Invalid date format (expected YYYY-MM-DD)');
    }
    return str;
  }

  @Get('projects/:projectId/workflow')
  async getProjectWorkflow(@Req() req: any, @Param('projectId') projectId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const access = (await this.dataSource.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = p.id
       AND pm.user_id = $2
      WHERE p.id = $1
        AND p.organization_id = $3
        AND (pm.user_id IS NOT NULL OR p.created_by = $2 OR p.manager_id = $2)
      LIMIT 1
      `,
      [projectId.trim(), String(currentUser.id), String(tenant.id)],
    )) as Array<{ ok?: number }>;

    if (!access?.[0]?.ok) {
      const exists = (await this.dataSource.query(
        `
        SELECT 1 AS ok
        FROM module_b_projects.projects p
        WHERE p.id = $1
          AND p.organization_id = $2
        LIMIT 1
        `,
        [projectId.trim(), String(tenant.id)],
      )) as Array<{ ok?: number }>;

      if (exists?.[0]?.ok) {
        throw new ForbiddenException('Missing required permission');
      }
      throw new BadRequestException('Project not found');
    }

    const workflows = (await this.dataSource.query(
      `
      SELECT w.id, w.project_id AS "projectId", w.name, w.is_default AS "isDefault", w.created_at AS "createdAt", w.updated_at AS "updatedAt"
      FROM module_b_projects.project_workflows w
      WHERE w.project_id = $1
      ORDER BY w.is_default DESC, w.created_at DESC
      LIMIT 1
      `,
      [projectId.trim()],
    )) as Array<{
      id: string;
      projectId: string;
      name: string;
      isDefault: boolean;
      createdAt: string;
      updatedAt: string;
    }>;

    const wf = workflows?.[0] ?? null;
    if (!wf?.id) {
      return { workflow: null, steps: [] };
    }

    const steps = (await this.dataSource.query(
      `
      SELECT s.id,
             s.workflow_id AS "workflowId",
             s.name,
             s.step_order AS "stepOrder",
             s.requires_validation AS "requiresValidation",
             s.validator_role AS "validatorRole",
             s.is_final_step AS "isFinalStep",
             s.created_at AS "createdAt",
             s.updated_at AS "updatedAt"
      FROM module_b_projects.project_workflow_steps s
      WHERE s.workflow_id = $1
      ORDER BY s.step_order ASC
      LIMIT 200
      `,
      [wf.id],
    )) as Array<{
      id: string;
      workflowId: string;
      name: string;
      stepOrder: number;
      requiresValidation: boolean;
      validatorRole: string | null;
      isFinalStep: boolean;
      createdAt: string;
      updatedAt: string;
    }>;

    return { workflow: wf, steps };
  }

  @Get('departments')
  async listDepartments(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    try {
      const rhRows = (await this.dataSource.query(
        `
        SELECT d.id, d.name, d.code
        FROM module_c_rh.departments d
        WHERE d.organization_id = $1 AND d.is_active = true
        ORDER BY d.name ASC
        LIMIT 500
        `,
        [tenant.id],
      )) as Array<{ id: string; name: string; code: string }>;

      if (rhRows.length > 0) {
        return rhRows;
      }
    } catch {
    }

    const coreRows = (await this.dataSource.query(
      `
      SELECT d.id, d.name, d.code
      FROM core.departments d
      WHERE d.organization_id = $1 AND d.is_active = true
      ORDER BY d.name ASC
      LIMIT 500
      `,
      [tenant.id],
    )) as Array<{ id: string; name: string; code: string }>;

    return coreRows;
  }

  @Get('organizations')
  async listOrganizations(@Req() req: any) {
    const currentUser = req.user as { id?: string } | undefined;

    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const orgIds = await this.resolveAccessibleOrganizationIdsForUser(String(currentUser.id));
    if (!orgIds.length) return [];

    const rows = (await this.dataSource.query(
      `
      SELECT o.id, o.name, o.name_code AS "nameCode", o.country
      FROM core.organizations o
      WHERE o.id = ANY($1::uuid[])
        AND o.is_active = true
      ORDER BY o.name ASC
      LIMIT 500
      `,
      [orgIds],
    )) as Array<{ id: string; name: string; nameCode: string | null; country: string }>;

    return rows;
  }

  @Get('organizations/:id/departments')
  async listDepartmentsByOrganization(@Req() req: any, @Param('id') organizationId: string) {
    const currentUser = req.user as { id?: string } | undefined;
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!organizationId || !organizationId.trim()) {
      throw new BadRequestException('organizationId is required');
    }

    const orgIds = await this.resolveAccessibleOrganizationIdsForUser(String(currentUser.id));
    if (!orgIds.includes(organizationId.trim())) {
      throw new BadRequestException('Organization not accessible');
    }

    try {
      const rhRows = (await this.dataSource.query(
        `
        SELECT d.id, d.name, d.code
        FROM module_c_rh.departments d
        WHERE d.organization_id = $1 AND d.is_active = true
        ORDER BY d.name ASC
        LIMIT 500
        `,
        [organizationId.trim()],
      )) as Array<{ id: string; name: string; code: string }>;

      if (rhRows.length > 0) {
        return rhRows;
      }
    } catch {
    }

    const coreRows = (await this.dataSource.query(
      `
      SELECT d.id, d.name, d.code
      FROM core.departments d
      WHERE d.organization_id = $1 AND d.is_active = true
      ORDER BY d.name ASC
      LIMIT 500
      `,
      [organizationId.trim()],
    )) as Array<{ id: string; name: string; code: string }>;

    return coreRows;
  }

  @Get('organizations/:id/users')
  async listOrganizationUsers(
    @Req() req: any,
    @Param('id') organizationId: string,
    @Query('departmentIds') departmentIdsRaw?: string,
  ) {
    const currentUser = req.user as { id?: string } | undefined;
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!organizationId || !organizationId.trim()) {
      throw new BadRequestException('organizationId is required');
    }

    const orgIds = await this.resolveAccessibleOrganizationIdsForUser(String(currentUser.id));
    if (!orgIds.includes(organizationId.trim())) {
      throw new BadRequestException('Organization not accessible');
    }

    const departmentIds = departmentIdsRaw
      ? this.uniqueStrings(
        String(departmentIdsRaw)
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      )
      : [];

    if (!departmentIds.length) {
      const rows = (await this.dataSource.query(
        `
        SELECT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.email
        FROM core.users u
        WHERE u.organization_id = $1
          AND u.is_active = true
          AND u.deleted_at IS NULL
        ORDER BY u.first_name ASC, u.last_name ASC
        LIMIT 500
        `,
        [organizationId.trim()],
      )) as Array<{ id: string; firstName: string; lastName: string; email: string }>;
      return rows;
    }

    try {
      const rows = (await this.dataSource.query(
        `
        SELECT DISTINCT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.email
        FROM core.users u
        LEFT JOIN module_c_rh.employees e
          ON e.user_id = u.id
         AND e.organization_id = $1
        WHERE u.organization_id = $1
          AND u.is_active = true
          AND u.deleted_at IS NULL
          AND (
            e.department_id = ANY($2::uuid[])
            OR (u.metadata->>'department') = ANY($2::text[])
          )
        ORDER BY u.first_name ASC, u.last_name ASC
        LIMIT 500
        `,
        [organizationId.trim(), departmentIds],
      )) as Array<{ id: string; firstName: string; lastName: string; email: string }>;

      return rows;
    } catch {
      const fallback = (await this.dataSource.query(
        `
        SELECT DISTINCT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.email
        FROM core.users u
        WHERE u.organization_id = $1
          AND u.is_active = true
          AND u.deleted_at IS NULL
          AND (u.metadata->>'department') = ANY($2::text[])
        ORDER BY u.first_name ASC, u.last_name ASC
        LIMIT 500
        `,
        [organizationId.trim(), departmentIds],
      )) as Array<{ id: string; firstName: string; lastName: string; email: string }>;

      return fallback;
    }
  }

  @Get('departments/:id/users')
  async listDepartmentUsers(@Req() req: any, @Param('id') departmentId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    if (!departmentId || !departmentId.trim()) {
      throw new BadRequestException('departmentId is required');
    }

    try {
      const rows = (await this.dataSource.query(
        `
        SELECT DISTINCT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.email
        FROM core.users u
        LEFT JOIN module_c_rh.employees e
          ON e.user_id = u.id
         AND e.organization_id = $1
        WHERE u.organization_id = $1
          AND u.is_active = true
          AND u.deleted_at IS NULL
          AND (
            e.department_id = $2
            OR (u.metadata->>'department') = $2
          )
        ORDER BY u.first_name ASC, u.last_name ASC
        LIMIT 500
        `,
        [tenant.id, departmentId],
      )) as Array<{ id: string; firstName: string; lastName: string; email: string }>;

      return rows;
    } catch {
      const fallback = (await this.dataSource.query(
        `
        SELECT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.email
        FROM core.users u
        WHERE u.organization_id = $1
          AND u.is_active = true
          AND u.deleted_at IS NULL
          AND (u.metadata->>'department') = $2
        ORDER BY u.first_name ASC, u.last_name ASC
        LIMIT 500
        `,
        [tenant.id, departmentId],
      )) as Array<{ id: string; firstName: string; lastName: string; email: string }>;

      return fallback;
    }
  }

  @Get('projects')
  async listProjects(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const isOrgAdminRows = (await this.dataSource.query(
      `
      SELECT 1 AS ok
      FROM core.user_roles ur
      INNER JOIN core.roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
        AND ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND r.is_active = true
        AND (
          r.is_system_role = true
          OR r.code IN ('SUPER_ADMIN','COUNTRY_MANAGER')
          OR (r.organization_id = $2 AND r.code IN ('COUNTRY_MANAGER','DEPARTMENT_MANAGER','PROJECT_MANAGER'))
        )
      LIMIT 1
      `,
      [String(currentUser.id), String(tenant.id)],
    )) as Array<{ ok?: number }>;

    const isOrgAdmin = !!isOrgAdminRows?.[0]?.ok;

    const rows = (await this.dataSource.query(
      `
      SELECT
        p.id,
        p.name,
        p.code,
        p.status,
        p.priority,
        p.progress,
        p.planned_end_date AS "plannedEndDate",
        p.description,
        COALESCE(o.name_code, o.name) AS "organizationLabel",
        (COALESCE(mu.first_name, '') || ' ' || COALESCE(mu.last_name, ''))::text AS "managerName",
        p.manager_id AS "managerId",
        p.created_by AS "createdBy",
        EXISTS (
          SELECT 1 FROM module_b_projects.project_managers pm
          WHERE pm.project_id = p.id AND pm.user_id = $1
        ) AS "isUserManager"
      FROM module_b_projects.projects p
      INNER JOIN core.organizations o ON o.id = p.organization_id
      LEFT JOIN core.users mu ON mu.id = p.manager_id
      WHERE (
        EXISTS (
          SELECT 1
          FROM module_b_projects.project_managers pm
          WHERE pm.project_id = p.id
            AND pm.user_id = $1
        )
        OR EXISTS (
          SELECT 1
          FROM module_b_projects.project_members pm2
          WHERE pm2.project_id = p.id
            AND pm2.user_id = $1
        )
        OR p.manager_id = $1
        OR p.created_by = $1
        OR (
          p.organization_id = $2
          AND $3 = true
        )
      )
      ORDER BY p.created_at DESC
      LIMIT 500
      `,
      [String(currentUser.id), String(tenant.id), isOrgAdmin],
    )) as Array<{
      id: string;
      name: string;
      code: string;
      status: string;
      priority: string | null;
      progress: number;
      plannedEndDate: string | null;
      description: string | null;
      organizationLabel: string | null;
      managerName: string | null;
      managerId: string | null;
      createdBy: string | null;
      isUserManager: boolean;
    }>;

    return rows;
  }

  @Patch('projects/:id/deadline')
  async updateProjectDeadline(
    @Req() req: any,
    @Param('id') projectId: string,
    @Body() body: { plannedEndDate?: string | null },
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!projectId || !projectId.trim()) {
      throw new BadRequestException('projectId is required');
    }

    const plannedEndDate = this.assertValidDateOrNull(body?.plannedEndDate);

    const access = (await this.dataSource.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = p.id
       AND pm.user_id = $2
      LEFT JOIN module_b_projects.project_managers pma
        ON pma.project_id = p.id
       AND pma.user_id = $2
      WHERE p.id = $1
        AND (
          pm.id IS NOT NULL
          OR pma.id IS NOT NULL
          OR p.manager_id = $2
          OR p.created_by = $2
        )
      LIMIT 1
      `,
      [projectId.trim(), String(currentUser.id)],
    )) as Array<{ ok?: number }>;

    if (!access?.[0]?.ok) {
      const exists = (await this.dataSource.query(
        `
        SELECT 1 AS ok
        FROM module_b_projects.projects p
        WHERE p.id = $1
        LIMIT 1
        `,
        [projectId.trim()],
      )) as Array<{ ok?: number }>;

      if (exists?.[0]?.ok) {
        throw new ForbiddenException('Missing required permission');
      }
      throw new BadRequestException('Project not found');
    }

    let result: any;
    try {
      result = await this.dataSource.query(
        `
        UPDATE module_b_projects.projects p
        SET planned_end_date = $1,
            updated_at = NOW()
        WHERE p.id = $2
        RETURNING p.id
        `,
        [plannedEndDate, projectId.trim()],
      );

      console.log('[updateProjectDeadline] result type:', typeof result, 'isArray:', Array.isArray(result));
      if (result) {
        console.log('[updateProjectDeadline] result keys:', Object.keys(result).slice(0, 5));
        if (Array.isArray(result)) {
          console.log('[updateProjectDeadline] result[0]:', JSON.stringify(result[0]));
        }
      }
    } catch (e: any) {
      const msg = String(e?.message ?? 'Update failed');
      throw new BadRequestException(msg);
    }

    let rows: any[] = [];

    if (result && typeof result === 'object' && 'affectedRows' in result) {
      const affectedRows = (result as any).affectedRows;
      if (affectedRows > 0) {
        return { ok: true };
      }
    }

    if (Array.isArray(result)) {
      if (Array.isArray(result[0]) && result.length === 1) {
        rows = result[0];
      } else if (result[0] && typeof result[0] === 'object' && !('affectedRows' in result[0])) {
        rows = result;
      } else if (result.length > 0) {
        rows = result;
      }
    } else if (result?.rows && Array.isArray(result.rows)) {
      rows = result.rows;
    }

    const hasUpdated = rows.length > 0 && rows[0]?.id;

    if (!hasUpdated) {
      const existsAfter = (await this.dataSource.query(
        `
        SELECT 1 AS ok
        FROM module_b_projects.projects p
        WHERE p.id = $1
        LIMIT 1
        `,
        [projectId.trim()],
      )) as Array<{ ok?: number }>;

      if (existsAfter?.[0]?.ok) {
        return { ok: true };
      }
      throw new BadRequestException('Project not found');
    }

    return { ok: true };
  }

  @Patch('projects/:id/status')
  async updateProjectStatus(
    @Req() req: any,
    @Param('id') projectId: string,
    @Body() body: { status: string },
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!projectId || !projectId.trim()) {
      throw new BadRequestException('projectId is required');
    }

    const validStatuses = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
    const status = String(body?.status ?? '').trim();
    if (!status || !validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid status. Valid values: ${validStatuses.join(', ')}`);
    }

    const access = (await this.dataSource.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = p.id
       AND pm.user_id = $2
      LEFT JOIN module_b_projects.project_managers pma
        ON pma.project_id = p.id
       AND pma.user_id = $2
      WHERE p.id = $1
        AND (
          pm.id IS NOT NULL
          OR pma.id IS NOT NULL
          OR p.manager_id = $2
          OR p.created_by = $2
        )
      LIMIT 1
      `,
      [projectId.trim(), String(currentUser.id)],
    )) as Array<{ ok?: number }>;

    if (!access?.[0]?.ok) {
      throw new ForbiddenException('You do not have permission to update this project');
    }

    const result = (await this.dataSource.query(
      `
      UPDATE module_b_projects.projects
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, organization_id
      `,
      [status, projectId.trim()],
    )) as Array<{ id: string; name: string; organization_id: string }>;

    if (!result?.length) {
      throw new BadRequestException('Project not found');
    }

    const { name: projectName, organization_id: orgId } = result[0];

    if (status === 'active') {
      await this.dataSource.query(
        `
        UPDATE module_b_projects.projects
        SET start_date = CURRENT_DATE
        WHERE id = $1 AND start_date IS NULL
        `,
        [projectId.trim()],
      );
    }

    const members = (await this.dataSource.query(
      `
        SELECT DISTINCT user_id
        FROM (
          SELECT user_id FROM module_b_projects.project_members WHERE project_id = $1
          UNION
          SELECT user_id FROM module_b_projects.project_managers WHERE project_id = $1
          UNION
          SELECT manager_id AS user_id FROM module_b_projects.projects WHERE id = $1 AND manager_id IS NOT NULL
          UNION
          SELECT created_by AS user_id FROM module_b_projects.projects WHERE id = $1 AND created_by IS NOT NULL
        ) AS all_users
        `,
      [projectId.trim()],
    )) as Array<{ user_id: string }>;

    const admins = (await this.dataSource.query(
      `
        SELECT DISTINCT ur.user_id
        FROM core.user_roles ur
        INNER JOIN core.roles r ON r.id = ur.role_id
        WHERE ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          AND r.is_active = true
          AND (
            r.is_system_role = true
            OR r.code IN ('SUPER_ADMIN', 'COUNTRY_MANAGER')
            OR (r.organization_id = $1 AND r.code IN ('COUNTRY_MANAGER', 'DEPARTMENT_MANAGER', 'PROJECT_MANAGER'))
          )
        `,
      [orgId],
    )) as Array<{ user_id: string }>;

    // Combiner les IDs uniques
    const allUserIds = new Set([
      ...members.map(m => m.user_id),
      ...admins.map(a => a.user_id),
    ]);

    // Labels pour les statuts
    const statusLabels: Record<string, string> = {
      'planning': 'Planification',
      'active': 'En cours',
      'on_hold': 'En pause',
      'completed': 'Terminé',
      'cancelled': 'Annulé',
    };

    // Créer les notifications
    const notifications = Array.from(allUserIds).map(userId => ({
      userId,
      organizationId: orgId,
      type: 'project_status_changed' as const,
      title: `Projet "${projectName}"`,
      message: `Le statut du projet a été modifié : ${statusLabels[status] || status}`,
      data: {
        projectId: projectId.trim(),
        newStatus: status,
        projectName,
      },
    }));

    if (notifications.length > 0) {
      await this.notificationService.createMany(notifications);
    }

    return { ok: true, status };
  }

  @Get('projects/:id/can-complete')
  async checkProjectCanComplete(@Req() req: any, @Param('id') projectId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!projectId || !projectId.trim()) {
      throw new BadRequestException('projectId is required');
    }

    // Vérifier l'accès au projet
    const access = (await this.dataSource.query(
      `
      WITH user_admin AS (
        SELECT 1 AS is_admin
        FROM core.user_roles ur
        INNER JOIN core.roles r ON r.id = ur.role_id
        WHERE ur.user_id = $2
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          AND r.is_active = true
          AND (
            r.is_system_role = true
            OR r.code IN ('SUPER_ADMIN', 'COUNTRY_MANAGER')
            OR (r.organization_id = $3 AND r.code IN ('COUNTRY_MANAGER', 'DEPARTMENT_MANAGER', 'PROJECT_MANAGER'))
          )
        LIMIT 1
      )
      SELECT 1 AS ok
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = p.id AND pm.user_id = $2
      LEFT JOIN module_b_projects.project_managers pma
        ON pma.project_id = p.id AND pma.user_id = $2
      WHERE p.id = $1
        AND (
          pm.id IS NOT NULL
          OR pma.id IS NOT NULL
          OR p.manager_id = $2
          OR p.created_by = $2
          OR EXISTS (SELECT 1 FROM user_admin)
        )
      LIMIT 1
      `,
      [projectId.trim(), String(currentUser.id), String(tenant.id)],
    )) as Array<{ ok?: number }>;

    if (!access?.[0]?.ok) {
      throw new ForbiddenException('Access denied');
    }

    // Vérifier s'il y a des tâches non terminées
    const incompleteTasks = (await this.dataSource.query(
      `
      SELECT COUNT(*) AS count
      FROM module_b_projects.tasks t
      WHERE t.project_id = $1
        AND t.status NOT IN ('completed', 'approved', 'cancelled')
      `,
      [projectId.trim()],
    )) as Array<{ count: string }>;

    // Vérifier s'il y a des sous-tâches non terminées
    const incompleteSubtasks = (await this.dataSource.query(
      `
      SELECT COUNT(*) AS count
      FROM module_b_projects.subtasks s
      INNER JOIN module_b_projects.tasks t ON t.id = s.task_id
      WHERE t.project_id = $1
        AND s.is_completed = false
      `,
      [projectId.trim()],
    )) as Array<{ count: string }>;

    const taskCount = parseInt(incompleteTasks[0]?.count || '0', 10);
    const subtaskCount = parseInt(incompleteSubtasks[0]?.count || '0', 10);

    return {
      canComplete: taskCount === 0 && subtaskCount === 0,
      incompleteTasks: taskCount,
      incompleteSubtasks: subtaskCount,
    };
  }

  @Get('projects/:id/members')
  async listProjectMembers(@Req() req: any, @Param('id') projectId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!projectId || !projectId.trim()) {
      throw new BadRequestException('projectId is required');
    }

    const access = (await this.dataSource.query(
      `
      WITH user_admin AS (
        SELECT 1 AS is_admin
        FROM core.user_roles ur
        INNER JOIN core.roles r ON r.id = ur.role_id
        WHERE ur.user_id = $2
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          AND r.is_active = true
          AND (
            r.is_system_role = true
            OR r.code IN ('SUPER_ADMIN', 'COUNTRY_MANAGER')
            OR (r.organization_id = $3 AND r.code IN ('COUNTRY_MANAGER', 'DEPARTMENT_MANAGER', 'PROJECT_MANAGER'))
          )
        LIMIT 1
      )
      SELECT 1 AS ok
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = p.id
       AND pm.user_id = $2
      LEFT JOIN module_b_projects.project_managers pma
        ON pma.project_id = p.id
       AND pma.user_id = $2
      WHERE p.id = $1
        AND (
          pm.id IS NOT NULL
          OR pma.id IS NOT NULL
          OR p.manager_id = $2
          OR p.created_by = $2
          OR EXISTS (SELECT 1 FROM user_admin)
        )
      LIMIT 1
      `,
      [projectId.trim(), String(currentUser.id), String(tenant.id)],
    )) as Array<{ ok?: number }>;

    if (!access?.[0]?.ok) {
      const exists = (await this.dataSource.query(
        `
        SELECT 1 AS ok
        FROM module_b_projects.projects p
        WHERE p.id = $1
        LIMIT 1
        `,
        [projectId.trim()],
      )) as Array<{ ok?: number }>;

      if (exists?.[0]?.ok) {
        throw new ForbiddenException('Missing required permission');
      }
      throw new BadRequestException('Project not found');
    }

    const rows = (await this.dataSource.query(
      `
      SELECT DISTINCT
        u.id,
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.email,
        pm.role_in_project AS "roleInProject",
        COALESCE(o.name_code, o.name) AS "organizationLabel",
        COALESCE(e.department_id, NULLIF(TRIM(u.metadata->>'department'), '')::uuid) AS "departmentId",
        d.name AS "departmentName",
        COUNT(t.id)::int AS "assignedTasksCount",
        COALESCE(AVG(t.progress), 0)::float AS "assignedTasksAvgProgress",
        MIN(t.due_date) FILTER (WHERE t.due_date IS NOT NULL) AS "assignedTasksNearestDueDate"
      FROM module_b_projects.project_members pm
      INNER JOIN core.users u ON u.id = pm.user_id
      LEFT JOIN core.organizations o ON o.id = u.organization_id
      LEFT JOIN LATERAL (
        SELECT e0.department_id
        FROM module_c_rh.employees e0
        WHERE e0.user_id = u.id
          AND e0.department_id IS NOT NULL
        ORDER BY e0.created_at DESC
        LIMIT 1
      ) e ON true
      LEFT JOIN module_c_rh.departments d
        ON d.id = COALESCE(e.department_id, NULLIF(TRIM(u.metadata->>'department'), '')::uuid)
      LEFT JOIN module_b_projects.tasks t
        ON t.project_id = pm.project_id
       AND t.assignee_id = u.id
      WHERE pm.project_id = $1
        AND u.is_active = true
        AND u.deleted_at IS NULL
      GROUP BY
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        pm.role_in_project,
        o.name_code,
        o.name,
        e.department_id,
        d.name,
        u.metadata
      ORDER BY u.first_name ASC, u.last_name ASC
      LIMIT 500
      `,
      [projectId.trim()],
    )) as Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      organizationLabel: string | null;
      departmentId: string | null;
      departmentName: string | null;
      assignedTasksCount: number;
      assignedTasksAvgProgress: number;
      assignedTasksNearestDueDate: string | null;
    }>;

    return rows;
  }

  @Get('projects/:projectId/members/:memberId/tasks')
  async listMemberTasksInProject(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!projectId || !projectId.trim()) {
      throw new BadRequestException('projectId is required');
    }
    if (!memberId || !memberId.trim()) {
      throw new BadRequestException('memberId is required');
    }

    // Vérifier l'accès au projet
    const access = (await this.dataSource.query(
      `
      SELECT 1 AS ok
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = p.id
       AND pm.user_id = $2
      LEFT JOIN module_b_projects.project_managers pma
        ON pma.project_id = p.id
       AND pma.user_id = $2
      WHERE p.id = $1
        AND (
          pm.id IS NOT NULL
          OR pma.id IS NOT NULL
          OR p.manager_id = $2
          OR p.created_by = $2
        )
      LIMIT 1
      `,
      [projectId.trim(), String(currentUser.id)],
    )) as Array<{ ok?: number }>;

    if (!access?.[0]?.ok) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // Récupérer les tâches du membre avec sous-tâches
    const tasks = (await this.dataSource.query(
      `
      SELECT 
        t.id,
        t.title,
        t.status,
        t.due_date AS "dueDate",
        t.priority,
        t.progress,
        ws.id AS "workflowStepId",
        ws.name AS "workflowStepName",
        ws.requires_validation AS "workflowStepRequiresValidation"
      FROM module_b_projects.tasks t
      LEFT JOIN module_b_projects.project_workflow_steps ws
        ON ws.id = t.current_step_id
      WHERE t.project_id = $1
        AND t.assignee_id = $2
      ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
      LIMIT 100
      `,
      [projectId.trim(), memberId.trim()],
    )) as Array<{
      id: string;
      title: string;
      status: string;
      dueDate: string | null;
      priority: string | null;
      progress: number;
      workflowStepId: string | null;
      workflowStepName: string | null;
      workflowStepRequiresValidation: boolean;
    }>;

    // Pour chaque tâche, récupérer les sous-tâches
    const tasksWithSubtasks = await Promise.all(
      tasks.map(async (task) => {
        const subtasks = (await this.dataSource.query(
          `
          SELECT 
            s.id,
            s.title,
            s.is_completed AS "isCompleted",
            s.due_date AS "dueDate",
            s.completed_at AS "completedAt"
          FROM module_b_projects.subtasks s
          WHERE s.task_id = $1
          ORDER BY s.created_at ASC
          LIMIT 50
          `,
          [task.id],
        )) as Array<{
          id: string;
          title: string;
          isCompleted: boolean;
          dueDate: string | null;
          completedAt: string | null;
        }>;

        return {
          id: task.id,
          title: task.title,
          status: task.status,
          dueDate: task.dueDate,
          priority: task.priority,
          progress: task.progress || 0,
          workflowStep: task.workflowStepId
            ? {
              id: task.workflowStepId,
              name: task.workflowStepName,
              requiresValidation: task.workflowStepRequiresValidation,
            }
            : undefined,
          subtasks: subtasks,
        };
      }),
    );

    return tasksWithSubtasks;
  }

  @Get('projects/:id/affectation-data')
  async getProjectAffectationData(@Req() req: any, @Param('id') projectId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context (x-organization-code)');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!projectId || !projectId.trim()) {
      throw new BadRequestException('projectId is required');
    }

    // Vérifier l'accès au projet
    const access = (await this.dataSource.query(
      `
      WITH user_admin AS (
        SELECT 1 AS is_admin
        FROM core.user_roles ur
        INNER JOIN core.roles r ON r.id = ur.role_id
        WHERE ur.user_id = $2
          AND ur.is_active = true
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          AND r.is_active = true
          AND (
            r.is_system_role = true
            OR r.code IN ('SUPER_ADMIN', 'COUNTRY_MANAGER')
            OR (r.organization_id = $3 AND r.code IN ('COUNTRY_MANAGER', 'DEPARTMENT_MANAGER', 'PROJECT_MANAGER'))
          )
        LIMIT 1
      )
      SELECT 1 AS ok
      FROM module_b_projects.projects p
      LEFT JOIN module_b_projects.project_members pm
        ON pm.project_id = p.id AND pm.user_id = $2
      LEFT JOIN module_b_projects.project_managers pma
        ON pma.project_id = p.id AND pma.user_id = $2
      WHERE p.id = $1
        AND (
          pm.id IS NOT NULL
          OR pma.id IS NOT NULL
          OR p.manager_id = $2
          OR p.created_by = $2
          OR EXISTS (SELECT 1 FROM user_admin)
        )
      LIMIT 1
      `,
      [projectId.trim(), String(currentUser.id), String(tenant.id)],
    )) as Array<{ ok?: number }>;

    if (!access?.[0]?.ok) {
      throw new ForbiddenException('Missing required permission');
    }

    // 1. Récupérer les membres avec leur charge de travail
    const members = (await this.dataSource.query(
      `
      SELECT DISTINCT
        u.id,
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.email,
        pm.role_in_project AS "roleInProject",
        COUNT(t.id) FILTER (WHERE t.status NOT IN ('completed', 'cancelled'))::int AS "activeTasksCount",
        COUNT(t.id)::int AS "totalTasksCount",
        COALESCE(AVG(t.progress) FILTER (WHERE t.status NOT IN ('completed', 'cancelled')), 0)::float AS "avgProgress",
        MIN(t.due_date) FILTER (WHERE t.due_date IS NOT NULL AND t.status NOT IN ('completed', 'cancelled')) AS "nearestDueDate",
        MAX(t.due_date) FILTER (WHERE t.due_date IS NOT NULL AND t.status NOT IN ('completed', 'cancelled')) AS "furthestDueDate",
        COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status NOT IN ('completed', 'cancelled'))::int AS "overdueTasksCount"
      FROM module_b_projects.project_members pm
      INNER JOIN core.users u ON u.id = pm.user_id
      LEFT JOIN module_b_projects.tasks t
        ON t.project_id = pm.project_id AND t.assignee_id = u.id
      WHERE pm.project_id = $1
        AND u.is_active = true
        AND u.deleted_at IS NULL
      GROUP BY
        u.id, u.first_name, u.last_name, u.email, pm.role_in_project
      ORDER BY u.first_name ASC, u.last_name ASC
      LIMIT 500
      `,
      [projectId.trim()],
    )) as Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      roleInProject: string | null;
      activeTasksCount: number;
      totalTasksCount: number;
      avgProgress: number;
      nearestDueDate: string | null;
      furthestDueDate: string | null;
      overdueTasksCount: number;
    }>;

    // 2. Récupérer les tâches non assignées
    const unassignedTasks = (await this.dataSource.query(
      `
      SELECT 
        t.id,
        t.title,
        t.status,
        t.priority,
        t.due_date AS "dueDate",
        t.progress,
        ws.name AS "workflowStepName"
      FROM module_b_projects.tasks t
      LEFT JOIN module_b_projects.project_workflow_steps ws ON ws.id = t.current_step_id
      WHERE t.project_id = $1
        AND t.assignee_id IS NULL
        AND t.status NOT IN ('completed', 'cancelled')
      ORDER BY 
        CASE t.priority 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          ELSE 4 
        END,
        t.due_date ASC NULLS LAST
      LIMIT 100
      `,
      [projectId.trim()],
    )) as Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      dueDate: string | null;
      progress: number;
      workflowStepName: string | null;
    }>;

    // 3. Récupérer toutes les tâches pour la matrice (avec assigné)
    const allTasks = (await this.dataSource.query(
      `
      SELECT 
        t.id,
        t.title,
        t.status,
        t.priority,
        t.due_date AS "dueDate",
        t.progress,
        t.assignee_id AS "assigneeId",
        CONCAT(u.first_name, ' ', u.last_name) AS "assigneeName",
        ws.name AS "workflowStepName"
      FROM module_b_projects.tasks t
      LEFT JOIN core.users u ON u.id = t.assignee_id
      LEFT JOIN module_b_projects.project_workflow_steps ws ON ws.id = t.current_step_id
      WHERE t.project_id = $1
        AND t.status NOT IN ('completed', 'cancelled')
      ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
      LIMIT 200
      `,
      [projectId.trim()],
    )) as Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      dueDate: string | null;
      progress: number;
      assigneeId: string | null;
      assigneeName: string | null;
      workflowStepName: string | null;
    }>;

    // 4. Calculer les indicateurs de charge pour chaque membre
    const membersWithWorkload = members.map((m) => {
      let workloadStatus: 'available' | 'moderate' | 'high' | 'overloaded' = 'available';

      if (m.overdueTasksCount > 0) {
        workloadStatus = 'overloaded';
      } else if (m.activeTasksCount >= 5) {
        workloadStatus = 'high';
      } else if (m.activeTasksCount >= 3) {
        workloadStatus = 'moderate';
      } else {
        workloadStatus = 'available';
      }

      return {
        ...m,
        workloadStatus,
        workloadScore: m.activeTasksCount + (m.overdueTasksCount * 2),
      };
    });

    return {
      members: membersWithWorkload,
      unassignedTasks,
      allTasks,
      summary: {
        totalMembers: members.length,
        totalUnassigned: unassignedTasks.length,
        totalActiveTasks: allTasks.length,
        overloadedMembers: membersWithWorkload.filter((m) => m.workloadStatus === 'overloaded').length,
      },
    };
  }
}

