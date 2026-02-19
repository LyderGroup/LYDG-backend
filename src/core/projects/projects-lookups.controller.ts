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

@UseGuards(RolesGuard)
@Controller('core/projects/lookups')
export class ProjectsLookupsController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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
        COALESCE(o.name_code, o.name) AS "organizationLabel",
        (COALESCE(mu.first_name, '') || ' ' || COALESCE(mu.last_name, ''))::text AS "managerName",
        p.manager_id AS "managerId"
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
      organizationLabel: string | null;
      managerName: string | null;
      managerId: string | null;
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
    } catch (e: any) {
      const msg = String(e?.message ?? 'Update failed');
      throw new BadRequestException(msg);
    }

    const rows = Array.isArray(result)
      ? result
      : Array.isArray((result as any)?.rows)
        ? (result as any).rows
        : [];

    const hasUpdated =
      !!rows?.[0]?.id ||
      (typeof (result as any)?.rowCount === 'number' ? (result as any).rowCount > 0 : false);

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
        throw new BadRequestException(
          `Project deadline update failed unexpectedly. projectId=${projectId.trim()} userId=${String(currentUser.id)}`,
        );
      }
      throw new BadRequestException('Project not found');
    }

    return { ok: true };
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

    const rows = (await this.dataSource.query(
      `
      SELECT DISTINCT
        u.id,
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.email,
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
}
