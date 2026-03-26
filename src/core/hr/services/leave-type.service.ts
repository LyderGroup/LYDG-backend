import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { LeaveType } from '../entities/leave-type.entity';

interface CreateLeaveTypeInput {
  organizationId?: string | null;
  name: string;
  code: string;
  description?: string | null;
  daysPerYear: number;
  accrualMethod?: string;
  maxCarryOver?: number;
  isPaid?: boolean;
  requiresApproval?: boolean;
  minDurationDays?: number;
  maxDurationDays?: number | null;
  advanceNoticeDays?: number;
  color?: string;
  icon?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

interface UpdateLeaveTypeInput {
  name?: string;
  code?: string;
  description?: string | null;
  daysPerYear?: number;
  accrualMethod?: string;
  maxCarryOver?: number;
  isPaid?: boolean;
  requiresApproval?: boolean;
  minDurationDays?: number;
  maxDurationDays?: number | null;
  advanceNoticeDays?: number;
  color?: string;
  icon?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class LeaveTypeService {
  constructor(
    @InjectRepository(LeaveType)
    private readonly repo: Repository<LeaveType>,
  ) { }

  async findAll(organizationId: string) {
    return this.repo.find({
      where: { organizationId, isActive: true },
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOne(organizationId: string, id: string) {
    return this.repo.findOne({ where: { id, organizationId } });
  }

  async create(organizationId: string, input: CreateLeaveTypeInput) {
    const entity = this.repo.create({
      organizationId,
      name: input.name,
      code: input.code,
      description: input.description ?? null,
      daysPerYear: input.daysPerYear,
      accrualMethod: (input.accrualMethod as any) ?? 'yearly',
      maxCarryOver: input.maxCarryOver ?? 0,
      isPaid: input.isPaid ?? true,
      requiresApproval: input.requiresApproval ?? true,
      minDurationDays: input.minDurationDays ?? 0.5,
      maxDurationDays: input.maxDurationDays ?? null,
      advanceNoticeDays: input.advanceNoticeDays ?? 7,
      color: input.color ?? '#3498db',
      icon: input.icon ?? null,
      displayOrder: input.displayOrder ?? 0,
      isActive: input.isActive ?? true,
    });
    return this.repo.save(entity);
  }

  async update(organizationId: string, id: string, input: UpdateLeaveTypeInput) {
    const patch: QueryDeepPartialEntity<LeaveType> = {};
    if (input.name) patch.name = input.name;
    if (input.code) patch.code = input.code;
    if (input.description !== undefined) patch.description = input.description;
    if (input.daysPerYear !== undefined) patch.daysPerYear = input.daysPerYear;
    if (input.accrualMethod) patch.accrualMethod = input.accrualMethod as any;
    if (input.maxCarryOver !== undefined) patch.maxCarryOver = input.maxCarryOver;
    if (input.isPaid !== undefined) patch.isPaid = input.isPaid;
    if (input.requiresApproval !== undefined) patch.requiresApproval = input.requiresApproval;
    if (input.minDurationDays !== undefined) patch.minDurationDays = input.minDurationDays;
    if (input.maxDurationDays !== undefined) patch.maxDurationDays = input.maxDurationDays;
    if (input.advanceNoticeDays !== undefined) patch.advanceNoticeDays = input.advanceNoticeDays;
    if (input.color) patch.color = input.color;
    if (input.icon !== undefined) patch.icon = input.icon;
    if (input.displayOrder !== undefined) patch.displayOrder = input.displayOrder;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    if (Object.keys(patch).length === 0) return this.findOne(organizationId, id);

    await this.repo.update({ id, organizationId }, patch);
    return this.findOne(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    await this.repo.delete({ id, organizationId });
    return { deleted: true };
  }
}
