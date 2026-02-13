import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import { Organization } from '../organizations/organizations.entity';
import { UserRole } from '../rbac/user-role.entity';
import { StrategicObjective } from './strategic-objective.entity';
import { Kpi } from './kpi.entity';
import { KpiValue } from './kpi-value.entity';
import { ReportExport } from './report-export.entity';

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface ListKpiValuesFilters {
  kpiId?: string;
  periodStart?: string;
  periodEnd?: string;
  periodType?: string;
}

export interface DashboardPeriod {
  periodStart: string;
  periodEnd: string;
  periodType: PeriodType;
}

@Injectable()
export class PilotageService {
  constructor(
    @InjectRepository(StrategicObjective)
    private readonly objectivesRepo: Repository<StrategicObjective>,
    @InjectRepository(Kpi)
    private readonly kpisRepo: Repository<Kpi>,
    @InjectRepository(KpiValue)
    private readonly kpiValuesRepo: Repository<KpiValue>,
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
    @InjectRepository(ReportExport)
    private readonly reportExportsRepo: Repository<ReportExport>,
  ) {}

  private async resolveAccessibleOrganizationIdsForUser(userId: string): Promise<string[]> {
    const userRoles = await this.userRolesRepo.find({
      where: { userId, isActive: true },
      relations: ['role', 'role.organization'],
      order: { assignedAt: 'DESC' },
    });

    const hasSystemRole = userRoles.some(
      (ur) => ur.role?.isSystemRole || ur.role?.code === 'SUPER_ADMIN',
    );

    if (hasSystemRole) {
      const orgs = await this.organizationsRepo.find({
        order: { createdAt: 'DESC' },
        take: 500,
      });
      return orgs.map((o) => o.id);
    }

    const organizationsMap = new Map<string, Organization>();
    for (const ur of userRoles) {
      const org = ur.role?.organization;
      if (org && !organizationsMap.has(org.id)) {
        organizationsMap.set(org.id, org);
      }
    }

    const parentIds = Array.from(organizationsMap.keys());
    if (parentIds.length > 0) {
      const children = await this.organizationsRepo.find({
        where: { parentOrgId: In(parentIds) },
        order: { createdAt: 'DESC' },
        take: 500,
      });
      for (const child of children) {
        if (!organizationsMap.has(child.id)) {
          organizationsMap.set(child.id, child);
        }
      }
    }

    return Array.from(organizationsMap.keys());
  }

  async getConsolidatedDashboardForUser(input: {
    userId: string;
    contextOrganizationId: string;
    organizationIds?: string[];
    periodStart?: string;
    periodEnd?: string;
    periodType?: PeriodType;
  }) {
    const allowedOrgIds = await this.resolveAccessibleOrganizationIdsForUser(input.userId);

    const desiredOrgIds = (input.organizationIds ?? []).filter(Boolean);
    const orgIds = (desiredOrgIds.length ? desiredOrgIds : allowedOrgIds).filter((id) =>
      allowedOrgIds.includes(id),
    );

    if (orgIds.length === 0) {
      return {
        period: {
          ...this.getDefaultMonthlyPeriod(),
          periodStart: input.periodStart ?? this.getDefaultMonthlyPeriod().periodStart,
          periodEnd: input.periodEnd ?? this.getDefaultMonthlyPeriod().periodEnd,
          periodType: input.periodType ?? this.getDefaultMonthlyPeriod().periodType,
        },
        scores: { global: 0 },
        organizations: [],
        totals: { organizations: 0, kpis: 0, objectives: 0 },
      };
    }

    const organizations = await this.organizationsRepo.find({
      where: { id: In(orgIds) },
      take: 500,
    });

    const orgById = new Map<string, Organization>();
    for (const org of organizations) {
      orgById.set(org.id, org);
    }

    const perOrg = [] as any[];
    for (const orgId of orgIds) {
      const dash = await this.getDashboardForTenant(orgId, {
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        periodType: input.periodType,
      });

      const org = orgById.get(orgId);
      perOrg.push({
        organization: org
          ? { id: org.id, name: org.name, nameCode: org.nameCode }
          : { id: orgId, name: 'Unknown', nameCode: null },
        ...dash,
      });
    }

    const globalScore =
      perOrg.length > 0
        ? perOrg.reduce((a, b) => a + Number(b?.scores?.global ?? 0), 0) / perOrg.length
        : 0;

    const totals = perOrg.reduce(
      (acc, o) => {
        acc.organizations += 1;
        acc.kpis += Array.isArray(o.kpis) ? o.kpis.length : 0;
        acc.objectives += Array.isArray(o.objectives) ? o.objectives.length : 0;
        return acc;
      },
      { organizations: 0, kpis: 0, objectives: 0 },
    );

    const period = perOrg[0]?.period ?? this.getDefaultMonthlyPeriod();

    return {
      period,
      scores: {
        global: this.clampScore(globalScore),
      },
      organizations: perOrg,
      totals,
    };
  }

  async listReportExportsForTenant(organizationId: string) {
    return this.reportExportsRepo.find({
      where: { organizationId },
      order: { generatedAt: 'DESC' },
      take: 200,
    });
  }

  async generateAndStoreExport(input: {
    format: 'pdf' | 'excel';
    contextOrganizationId: string;
    userId: string | null;
    organizationIds?: string[];
    periodStart?: string;
    periodEnd?: string;
    periodType?: PeriodType;
  }): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    const data = await this.getConsolidatedDashboardForUser({
      userId: input.userId ?? '',
      contextOrganizationId: input.contextOrganizationId,
      organizationIds: input.organizationIds,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      periodType: input.periodType,
    });

    const fileSafePeriod = `${data.period.periodType}_${data.period.periodStart}_${data.period.periodEnd}`;
    const fileName = `pilotage_${fileSafePeriod}.${input.format === 'excel' ? 'xlsx' : 'pdf'}`;

    let buffer: Buffer;
    let contentType: string;

    if (input.format === 'excel') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Pilotage');

      ws.addRow(['Pilotage consolidé']);
      ws.addRow(['Période', data.period.periodType, data.period.periodStart, data.period.periodEnd]);
      ws.addRow(['Score global', Math.round(Number(data.scores.global ?? 0))]);
      ws.addRow([]);

      ws.addRow(['Filiale', 'Code', 'KPI', 'Statut', 'Valeur', 'Cible', 'Écart']);
      for (const orgBlock of data.organizations ?? []) {
        const orgName = orgBlock?.organization?.name ?? '';
        const kpis = Array.isArray(orgBlock?.kpis) ? orgBlock.kpis : [];
        for (const k of kpis) {
          ws.addRow([
            orgName,
            String(k?.code ?? ''),
            String(k?.name ?? ''),
            String(k?.status ?? ''),
            k?.value ?? '',
            k?.targetValue ?? '',
            k?.variance ?? '',
          ]);
        }
      }

      const arr = await wb.xlsx.writeBuffer();
      buffer = Buffer.from(arr);
      contentType =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      const doc = new PDFDocument({ size: 'A4', margin: 36 });
      const chunks: Buffer[] = [];

      doc.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));

      doc.fontSize(16).text('Pilotage consolidé', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Période: ${data.period.periodType} ${data.period.periodStart} → ${data.period.periodEnd}`);
      doc.text(`Score global: ${Math.round(Number(data.scores.global ?? 0))}%`);
      doc.moveDown(1);

      for (const orgBlock of data.organizations ?? []) {
        const orgName = orgBlock?.organization?.name ?? 'Filiale';
        doc.fontSize(12).text(orgName, { underline: true });
        doc.moveDown(0.3);
        const kpis = Array.isArray(orgBlock?.kpis) ? orgBlock.kpis : [];
        for (const k of kpis.slice(0, 40)) {
          doc
            .fontSize(9)
            .text(
              `${String(k?.code ?? '')} ${String(k?.name ?? '')} | statut: ${String(k?.status ?? '')} | valeur: ${String(
                k?.value ?? '-',
              )} | cible: ${String(k?.targetValue ?? '-')}`,
            );
        }
        doc.moveDown(0.8);
      }

      doc.end();
      buffer = await new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      });
      contentType = 'application/pdf';
    }

    await this.reportExportsRepo.save(
      this.reportExportsRepo.create({
        organizationId: input.contextOrganizationId,
        reportId: null,
        periodStart: data.period.periodStart,
        periodEnd: data.period.periodEnd,
        periodType: data.period.periodType,
        format: input.format,
        fileName,
        storageUrl: null,
        payload: {
          organizationIds: input.organizationIds ?? null,
          totals: data.totals,
        },
        generatedBy: input.userId,
      }),
    );

    return { buffer, contentType, fileName };
  }

  private getDefaultMonthlyPeriod(): DashboardPeriod {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
    return {
      periodStart: toIsoDate(start),
      periodEnd: toIsoDate(end),
      periodType: 'monthly',
    };
  }

  private clampScore(value: number) {
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }

  private computeKpiScore(input: {
    value: number;
    target: number | null;
    direction: string | null;
  }): number | null {
    const target = input.target;
    if (target === null || Number.isNaN(target) || target === 0) {
      return null;
    }

    const v = input.value;
    if (Number.isNaN(v)) return null;

    if (input.direction === 'decrease') {
      if (v <= target) return 100;
      return this.clampScore((target / v) * 100);
    }

    if (input.direction === 'neutral') {
      const diffPct = Math.abs(v - target) / target;
      return this.clampScore((1 - diffPct) * 100);
    }

    return this.clampScore((v / target) * 100);
  }

  async listObjectivesForTenant(organizationId: string) {
    return this.objectivesRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async createObjectiveForTenant(
    organizationId: string,
    createdBy: string | null,
    input: {
      title: string;
      description?: string | null;
      objectiveType?: string | null;
      periodType?: string | null;
      year: number;
      quarter?: number | null;
      startDate: string;
      endDate: string;
      targetValue?: string | number | null;
      currentValue?: string | number | null;
      unit?: string | null;
      status?: string | null;
      ownerId?: string | null;
      parentObjectiveId?: string | null;
    },
  ) {
    if (!input.title || !input.title.trim()) {
      throw new BadRequestException('Le titre est obligatoire');
    }
    if (!input.year || Number.isNaN(Number(input.year))) {
      throw new BadRequestException("L'année est obligatoire");
    }

    const objective = this.objectivesRepo.create({
      organizationId,
      parentObjectiveId: input.parentObjectiveId ?? null,
      title: input.title,
      description: input.description ?? null,
      objectiveType: input.objectiveType ?? null,
      periodType: input.periodType ?? null,
      year: Number(input.year),
      quarter: input.quarter ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      targetValue: input.targetValue !== undefined && input.targetValue !== null ? String(input.targetValue) : null,
      currentValue:
        input.currentValue !== undefined && input.currentValue !== null
          ? String(input.currentValue)
          : '0',
      unit: input.unit ?? null,
      status: input.status?.trim() ? input.status.trim() : 'active',
      ownerId: input.ownerId ?? null,
      createdBy: createdBy ?? null,
    });

    return this.objectivesRepo.save(objective);
  }

  async updateObjectiveForTenant(
    organizationId: string,
    id: string,
    _updatedBy: string | null,
    input: {
      title?: string;
      description?: string | null;
      objectiveType?: string | null;
      periodType?: string | null;
      year?: number;
      quarter?: number | null;
      startDate?: string;
      endDate?: string;
      targetValue?: string | number | null;
      currentValue?: string | number | null;
      unit?: string | null;
      status?: string | null;
      ownerId?: string | null;
      parentObjectiveId?: string | null;
    },
  ) {
    const patch: Partial<StrategicObjective> = {};

    if (typeof input.title === 'string') patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description ?? null;
    if (input.objectiveType !== undefined) patch.objectiveType = input.objectiveType ?? null;
    if (input.periodType !== undefined) patch.periodType = input.periodType ?? null;
    if (input.year !== undefined) patch.year = Number(input.year);
    if (input.quarter !== undefined) patch.quarter = input.quarter ?? null;
    if (typeof input.startDate === 'string') patch.startDate = input.startDate;
    if (typeof input.endDate === 'string') patch.endDate = input.endDate;
    if (input.targetValue !== undefined) {
      patch.targetValue = input.targetValue !== null ? String(input.targetValue) : null;
    }
    if (input.currentValue !== undefined) {
      patch.currentValue = input.currentValue !== null ? String(input.currentValue) : '0';
    }
    if (input.unit !== undefined) patch.unit = input.unit ?? null;
    if (input.status !== undefined) patch.status = input.status ?? 'active';
    if (input.ownerId !== undefined) patch.ownerId = input.ownerId ?? null;
    if (input.parentObjectiveId !== undefined) patch.parentObjectiveId = input.parentObjectiveId ?? null;

    if (Object.keys(patch).length === 0) {
      return this.objectivesRepo.findOne({ where: { id, organizationId } });
    }

    await this.objectivesRepo.update({ id, organizationId }, patch as any);
    return this.objectivesRepo.findOne({ where: { id, organizationId } });
  }

  async deleteObjectiveForTenant(organizationId: string, id: string) {
    await this.objectivesRepo.delete({ id, organizationId });
    return { deleted: true };
  }

  async listKpisForTenant(organizationId: string) {
    return this.kpisRepo.find({
      where: { organizationId },
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async createKpiForTenant(
    organizationId: string,
    createdBy: string | null,
    input: {
      code: string;
      name: string;
      description?: string | null;
      objectiveId?: string | null;
      frequency?: string | null;
      unit?: string | null;
      direction?: string | null;
      targetValue?: string | number | null;
      warningThreshold?: string | number | null;
      criticalThreshold?: string | number | null;
      isActive?: boolean;
      isVisibleDashboard?: boolean;
      displayOrder?: number;
    },
  ) {
    if (!input.code || !input.code.trim()) {
      throw new BadRequestException('Le code KPI est obligatoire');
    }
    if (!input.name || !input.name.trim()) {
      throw new BadRequestException('Le nom KPI est obligatoire');
    }

    const kpi = this.kpisRepo.create({
      organizationId,
      objectiveId: input.objectiveId ?? null,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      frequency: input.frequency ?? null,
      unit: input.unit ?? null,
      direction: input.direction ?? null,
      targetValue: input.targetValue !== undefined && input.targetValue !== null ? String(input.targetValue) : null,
      warningThreshold:
        input.warningThreshold !== undefined && input.warningThreshold !== null
          ? String(input.warningThreshold)
          : null,
      criticalThreshold:
        input.criticalThreshold !== undefined && input.criticalThreshold !== null
          ? String(input.criticalThreshold)
          : null,
      isActive: typeof input.isActive === 'boolean' ? input.isActive : true,
      isVisibleDashboard:
        typeof input.isVisibleDashboard === 'boolean' ? input.isVisibleDashboard : true,
      displayOrder: typeof input.displayOrder === 'number' ? input.displayOrder : 0,
      createdBy: createdBy ?? null,
    });

    return this.kpisRepo.save(kpi);
  }

  async updateKpiForTenant(
    organizationId: string,
    id: string,
    _updatedBy: string | null,
    input: {
      code?: string;
      name?: string;
      description?: string | null;
      objectiveId?: string | null;
      frequency?: string | null;
      unit?: string | null;
      direction?: string | null;
      targetValue?: string | number | null;
      warningThreshold?: string | number | null;
      criticalThreshold?: string | number | null;
      isActive?: boolean;
      isVisibleDashboard?: boolean;
      displayOrder?: number;
    },
  ) {
    const patch: Partial<Kpi> = {};

    if (typeof input.code === 'string') patch.code = input.code;
    if (typeof input.name === 'string') patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description ?? null;
    if (input.objectiveId !== undefined) patch.objectiveId = input.objectiveId ?? null;
    if (input.frequency !== undefined) patch.frequency = input.frequency ?? null;
    if (input.unit !== undefined) patch.unit = input.unit ?? null;
    if (input.direction !== undefined) patch.direction = input.direction ?? null;
    if (input.targetValue !== undefined) {
      patch.targetValue = input.targetValue !== null ? String(input.targetValue) : null;
    }
    if (input.warningThreshold !== undefined) {
      patch.warningThreshold = input.warningThreshold !== null ? String(input.warningThreshold) : null;
    }
    if (input.criticalThreshold !== undefined) {
      patch.criticalThreshold = input.criticalThreshold !== null ? String(input.criticalThreshold) : null;
    }
    if (typeof input.isActive === 'boolean') patch.isActive = input.isActive;
    if (typeof input.isVisibleDashboard === 'boolean') patch.isVisibleDashboard = input.isVisibleDashboard;
    if (typeof input.displayOrder === 'number') patch.displayOrder = input.displayOrder;

    if (Object.keys(patch).length === 0) {
      return this.kpisRepo.findOne({ where: { id, organizationId } });
    }

    await this.kpisRepo.update({ id, organizationId }, patch as any);
    return this.kpisRepo.findOne({ where: { id, organizationId } });
  }

  async deleteKpiForTenant(organizationId: string, id: string) {
    await this.kpisRepo.delete({ id, organizationId });
    return { deleted: true };
  }

  async listKpiValuesForTenant(
    organizationId: string,
    filters?: ListKpiValuesFilters | string,
  ) {
    const normalizedFilters: ListKpiValuesFilters | undefined =
      typeof filters === 'string' ? { kpiId: filters } : filters;

    const qb = this.kpiValuesRepo
      .createQueryBuilder('v')
      .where('v.organization_id = :orgId', { orgId: organizationId });

    if (normalizedFilters?.kpiId) {
      qb.andWhere('v.kpi_id = :kpiId', { kpiId: normalizedFilters.kpiId });
    }

    if (normalizedFilters?.periodType) {
      qb.andWhere('v.period_type = :periodType', { periodType: normalizedFilters.periodType });
    }

    if (normalizedFilters?.periodStart) {
      qb.andWhere('v.period_start >= :periodStart', { periodStart: normalizedFilters.periodStart });
    }

    if (normalizedFilters?.periodEnd) {
      qb.andWhere('v.period_end <= :periodEnd', { periodEnd: normalizedFilters.periodEnd });
    }

    qb.orderBy('v.period_start', 'DESC').addOrderBy('v.created_at', 'DESC');
    return qb.getMany();
  }

  async getDashboardForTenant(
    organizationId: string,
    input?: Partial<DashboardPeriod>,
  ) {
    const period: DashboardPeriod = {
      ...this.getDefaultMonthlyPeriod(),
      ...(input ?? {}),
    } as DashboardPeriod;

    const objectives = await this.objectivesRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });

    const kpis = await this.kpisRepo.find({
      where: { organizationId, isActive: true },
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
    });

    const values = await this.listKpiValuesForTenant(organizationId, {
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      periodType: period.periodType,
    });

    const latestValueByKpiId = new Map<string, KpiValue>();
    for (const v of values) {
      if (!latestValueByKpiId.has(v.kpiId)) {
        latestValueByKpiId.set(v.kpiId, v);
      }
    }

    const kpisDto = kpis
      .filter((k) => k.isVisibleDashboard)
      .map((k) => {
        const v = latestValueByKpiId.get(k.id) ?? null;
        const rawValue = v ? Number(v.value) : null;
        const rawTarget = v?.targetValue ? Number(v.targetValue) : k.targetValue ? Number(k.targetValue) : null;
        const direction = v?.direction ?? k.direction ?? null;

        const status = v?.status ?? 'missing';
        const score = rawValue !== null ? this.computeKpiScore({ value: rawValue, target: rawTarget, direction }) : null;

        return {
          id: k.id,
          objectiveId: k.objectiveId,
          code: k.code,
          name: k.name,
          unit: k.unit,
          frequency: k.frequency,
          direction,
          value: v ? v.value : null,
          targetValue: rawTarget !== null && !Number.isNaN(rawTarget) ? String(rawTarget) : null,
          variance: v?.variance ?? null,
          variancePercentage: v?.variancePercentage ?? null,
          status,
          score,
          period,
        };
      });

    const objectiveScores = new Map<string, number>();
    const objectiveKpis = new Map<string, { scores: number[]; kpis: any[] }>();

    for (const k of kpisDto) {
      if (!k.objectiveId) continue;
      if (!objectiveKpis.has(k.objectiveId)) {
        objectiveKpis.set(k.objectiveId, { scores: [], kpis: [] });
      }
      const bucket = objectiveKpis.get(k.objectiveId)!;
      bucket.kpis.push(k);
      if (typeof k.score === 'number') {
        bucket.scores.push(k.score);
      }
    }

    for (const [objectiveId, bucket] of objectiveKpis.entries()) {
      const avg =
        bucket.scores.length > 0
          ? bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length
          : 0;
      objectiveScores.set(objectiveId, this.clampScore(avg));
    }

    const objectivesDto = objectives.map((o) => {
      const score = objectiveScores.get(o.id) ?? 0;
      return {
        id: o.id,
        parentObjectiveId: o.parentObjectiveId,
        title: o.title,
        description: o.description,
        objectiveType: o.objectiveType,
        periodType: o.periodType,
        year: o.year,
        quarter: o.quarter,
        startDate: o.startDate,
        endDate: o.endDate,
        progress: null,
        score,
      };
    });

    const globalScore =
      objectivesDto.length > 0
        ? objectivesDto.reduce((a, b) => a + (b.score ?? 0), 0) / objectivesDto.length
        : 0;

    return {
      period,
      scores: {
        global: this.clampScore(globalScore),
      },
      objectives: objectivesDto,
      kpis: kpisDto,
    };
  }

  async createKpiValueForTenant(
    organizationId: string,
    input: {
      kpiId: string;
      periodStart: string;
      periodEnd: string;
      periodType?: string | null;
      value: string | number;
      targetValue?: string | number | null;
      notes?: string | null;
    },
  ) {
    if (!input.kpiId || !input.kpiId.trim()) {
      throw new BadRequestException('kpiId est obligatoire');
    }

    const kpi = await this.kpisRepo.findOne({ where: { id: input.kpiId, organizationId } });
    if (!kpi) {
      throw new NotFoundException('KPI introuvable');
    }

    const kpiValue = this.kpiValuesRepo.create({
      organizationId,
      kpiId: input.kpiId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      periodType: input.periodType ?? null,
      value: String(input.value),
      targetValue: input.targetValue !== undefined && input.targetValue !== null ? String(input.targetValue) : null,
      notes: input.notes ?? null,
    });

    return this.kpiValuesRepo.save(kpiValue);
  }

  async deleteKpiValueForTenant(organizationId: string, id: string) {
    await this.kpiValuesRepo.delete({ id, organizationId });
    return { deleted: true };
  }
}
