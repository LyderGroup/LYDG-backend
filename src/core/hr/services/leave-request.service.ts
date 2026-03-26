import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveRequest, LeaveRequestStatus } from '../entities/leave-request.entity';
import { Employee } from '../employee.entity';

interface CreateLeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  startPeriod?: string;
  endPeriod?: string;
  totalDays: number;
  reason?: string | null;
  destination?: string | null;
  emergencyContact?: string | null;
  substituteEmployeeId?: string | null;
  handoverNotes?: string | null;
}

interface ListLeaveRequestsOptions {
  page?: number;
  limit?: number;
  employeeId?: string;
  status?: LeaveRequestStatus;
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class LeaveRequestService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly repo: Repository<LeaveRequest>,
  ) {}

  async findPage(organizationId: string, options: ListLeaveRequestsOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 20;

    const qb = this.repo
      .createQueryBuilder('lr')
      .leftJoinAndSelect('lr.employee', 'employee')
      .leftJoinAndSelect('lr.leaveType', 'leaveType')
      .leftJoinAndSelect('lr.approver', 'approver')
      .innerJoin('employee.organization', 'org')
      .where('org.id = :orgId', { orgId: organizationId });

    if (options.employeeId) {
      qb.andWhere('lr.employee_id = :empId', { empId: options.employeeId });
    }

    if (options.status) {
      qb.andWhere('lr.status = :status', { status: options.status });
    }

    if (options.startDate) {
      qb.andWhere('lr.start_date >= :startDate', { startDate: options.startDate });
    }

    if (options.endDate) {
      qb.andWhere('lr.end_date <= :endDate', { endDate: options.endDate });
    }

    qb.orderBy('lr.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { data: items, meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 } };
  }

  async findOne(organizationId: string, id: string) {
    return this.repo.findOne({
      where: { id },
      relations: ['employee', 'leaveType', 'approver', 'substituteEmployee'],
    });
  }

  async create(input: CreateLeaveRequestInput) {
    const entity = this.repo.create({
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      startPeriod: (input.startPeriod as any) ?? 'full_day',
      endPeriod: (input.endPeriod as any) ?? 'full_day',
      totalDays: input.totalDays,
      reason: input.reason ?? null,
      destination: input.destination ?? null,
      emergencyContact: input.emergencyContact ?? null,
      substituteEmployeeId: input.substituteEmployeeId ?? null,
      handoverNotes: input.handoverNotes ?? null,
      status: 'pending',
    });
    return this.repo.save(entity);
  }

  async approve(organizationId: string, id: string, approvedBy: string, notes?: string) {
    await this.repo.update({ id }, {
      status: 'approved' as LeaveRequestStatus,
      approvedBy,
      approvalDate: new Date(),
    } as any);
    return this.findOne(organizationId, id);
  }

  async reject(organizationId: string, id: string, rejectedBy: string, reason: string) {
    await this.repo.update({ id }, {
      status: 'rejected' as LeaveRequestStatus,
      approvedBy: rejectedBy,
      approvalDate: new Date(),
      rejectionReason: reason,
    } as any);
    return this.findOne(organizationId, id);
  }

  async cancel(organizationId: string, id: string) {
    await this.repo.update({ id }, { status: 'cancelled' as LeaveRequestStatus } as any);
    return this.findOne(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    await this.repo.delete({ id });
    return { deleted: true };
  }
}
