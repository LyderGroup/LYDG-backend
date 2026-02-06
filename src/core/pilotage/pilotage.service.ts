import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StrategicObjective } from './strategic-objective.entity';
import { Kpi } from './kpi.entity';
import { KpiValue } from './kpi-value.entity';

@Injectable()
export class PilotageService {
  constructor(
    @InjectRepository(StrategicObjective)
    private readonly objectivesRepo: Repository<StrategicObjective>,
    @InjectRepository(Kpi)
    private readonly kpisRepo: Repository<Kpi>,
    @InjectRepository(KpiValue)
    private readonly kpiValuesRepo: Repository<KpiValue>,
  ) {}

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

  async listKpiValuesForTenant(organizationId: string, kpiId?: string) {
    const where: any = { organizationId };
    if (kpiId) {
      where.kpiId = kpiId;
    }
    return this.kpiValuesRepo.find({ where, order: { createdAt: 'DESC' } });
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
