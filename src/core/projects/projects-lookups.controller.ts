import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
      // ignore if RH schema not installed
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
      WHERE p.organization_id = $1
      ORDER BY p.created_at DESC
      LIMIT 500
      `,
      [tenant.id],
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

    const result = await this.dataSource.query(
      `
      UPDATE module_b_projects.projects p
      SET planned_end_date = $1,
          updated_at = NOW()
      WHERE p.id = $2
        AND p.organization_id = $3
      RETURNING p.id
      `,
      [plannedEndDate, projectId.trim(), tenant.id],
    );

    if (!Array.isArray(result) || !result[0]?.id) {
      const existsElsewhere = (await this.dataSource.query(
        `
        SELECT p.id, p.organization_id AS "organizationId"
        FROM module_b_projects.projects p
        WHERE p.id = $1
        LIMIT 1
        `,
        [projectId.trim()],
      )) as Array<{ id?: string; organizationId?: string }>;

      if (existsElsewhere[0]?.id) {
        throw new BadRequestException(
          `Project not found in this organization (tenant mismatch). projectId=${projectId.trim()} tenantOrgId=${String(
            tenant.id,
          )} projectOrgId=${String(existsElsewhere[0]?.organizationId ?? '')}`,
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

    const rows = (await this.dataSource.query(
      `
      SELECT DISTINCT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.email
      FROM module_b_projects.project_members pm
      INNER JOIN core.users u ON u.id = pm.user_id
      INNER JOIN module_b_projects.projects p ON p.id = pm.project_id
      WHERE pm.project_id = $1
        AND p.organization_id = $2
        AND u.is_active = true
        AND u.deleted_at IS NULL
      ORDER BY u.first_name ASC, u.last_name ASC
      LIMIT 500
      `,
      [projectId, tenant.id],
    )) as Array<{ id: string; firstName: string; lastName: string; email: string }>;

    return rows;
  }
}
