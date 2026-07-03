import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { LeaveRequest, LeaveRequestStatus } from '../entities/leave-request.entity';
import { Employee } from '../employee.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { HR_PERMISSIONS } from '../hr.permissions';

export interface LeaveRequestUserContext {
  employeeId?: string;
  permissionCodes: string[];
  organizationId: string;
}

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

export interface LeaveRequestAttachment {
  /** URL relative servie par /uploads/... */
  url: string;
  /** Nom original du fichier tel que fourni par l'utilisateur. */
  fileName: string;
  /** Type MIME (filtré côté multer). */
  mimeType: string;
  /** Taille en octets. */
  size: number;
  /** ISO date d'upload. */
  uploadedAt: string;
}

interface CreateWithCodeInput {
  employeeId: string;
  organizationId?: string;
  leaveTypeId?: string;
  leaveTypeCode?: string;
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
  isJoker?: boolean;
  isPartial?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  attachments?: LeaveRequestAttachment[];
}

interface ListLeaveRequestsOptions {
  page?: number;
  limit?: number;
  employeeId?: string;
  status?: LeaveRequestStatus;
  startDate?: Date;
  endDate?: Date;
  scope?: 'own' | 'team' | 'all';
}

@Injectable()
export class LeaveRequestService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly repo: Repository<LeaveRequest>,
    private readonly dataSource: DataSource,
  ) { }

  async findPage(organizationId: string, options: ListLeaveRequestsOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 20;
    const scope = options.scope || 'own';

    const employeeRepo = this.dataSource.getRepository(Employee);

    // Determine which employee IDs to include based on scope
    let employeeIds: string[] = [];

    if (scope === 'own' && options.employeeId) {
      // Only own requests
      employeeIds = [options.employeeId];
    } else if (scope === 'team' && options.employeeId) {
      // Requests from same department
      const me = await employeeRepo.findOne({
        where: { id: options.employeeId },
        select: ['id', 'departmentId'],
      });
      if (me?.departmentId) {
        const teamMembers = await employeeRepo.find({
          where: { organizationId, departmentId: me.departmentId },
          select: ['id'],
        });
        employeeIds = teamMembers.map(e => e.id);
      } else {
        // No department, fallback to own
        employeeIds = [options.employeeId];
      }
    } else {
      // All employees in org
      const employees = await employeeRepo.find({
        where: { organizationId },
        select: ['id'],
      });
      employeeIds = employees.map(e => e.id);
    }

    if (employeeIds.length === 0) {
      return { data: [], meta: { total: 0, page, limit, pageCount: 1 } };
    }

    const where: any = {};
    where.employeeId = In(employeeIds);
    if (options.status) {
      where.status = options.status;
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      relations: ['employee', 'employee.user', 'leaveType'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data: items, meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 } };
  }

  async findOne(organizationId: string, id: string) {
    return this.repo.findOne({
      where: { id, employee: { organizationId } },
      relations: ['employee', 'employee.user', 'leaveType'],
    });
  }

  private async isSameDepartment(managerEmployeeId: string | undefined, targetEmployeeId: string, organizationId: string): Promise<boolean> {
    if (!managerEmployeeId) return false;
    const employeeRepo = this.dataSource.getRepository(Employee);
    const [manager, target] = await Promise.all([
      employeeRepo.findOne({ where: { id: managerEmployeeId }, select: ['id', 'departmentId'] }),
      employeeRepo.findOne({ where: { id: targetEmployeeId, organizationId }, select: ['id', 'departmentId'] }),
    ]);
    return !!manager?.departmentId && !!target?.departmentId && manager.departmentId === target.departmentId;
  }

  async assertCanReadLeave(item: LeaveRequest, user: LeaveRequestUserContext): Promise<void> {
    const { permissionCodes, employeeId } = user;
    if (permissionCodes.includes(HR_PERMISSIONS.HR_LEAVE_READ_ALL)) return;
    if (item.employeeId === employeeId) return;
    if (permissionCodes.includes(HR_PERMISSIONS.HR_LEAVE_READ_TEAM)) {
      const sameDept = await this.isSameDepartment(employeeId, item.employeeId, user.organizationId);
      if (sameDept) return;
    }
    throw new ForbiddenException('Accès refusé à cette demande de congé');
  }

  async assertCanApproveLeave(item: LeaveRequest, user: LeaveRequestUserContext): Promise<void> {
    const { permissionCodes, employeeId } = user;
    if (!permissionCodes.includes(HR_PERMISSIONS.HR_LEAVE_APPROVE)) {
      throw new ForbiddenException('Vous n\'avez pas la permission d\'approuver les congés');
    }
    if (item.status !== 'pending') {
      throw new BadRequestException('Seules les demandes en attente peuvent être traitées');
    }
    if (permissionCodes.includes(HR_PERMISSIONS.HR_LEAVE_READ_ALL)) return;
    const sameDept = await this.isSameDepartment(employeeId, item.employeeId, user.organizationId);
    if (!sameDept) {
      throw new ForbiddenException('Vous ne pouvez agir que sur les demandes de votre département');
    }
  }

  assertCanCancelLeave(item: LeaveRequest, user: LeaveRequestUserContext): void {
    if (item.employeeId !== user.employeeId) {
      throw new ForbiddenException('Vous ne pouvez annuler que vos propres demandes');
    }
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

  /**
   * Valide les contraintes métier avant création :
   * - Délai minimum de 14j pour conge_paye et autre (sauf joker).
   * - Quota hebdomadaire de Joker par employé.
   * Lève BadRequestException si la règle est enfreinte.
   */
  private async assertLeaveRequestPolicy(input: CreateWithCodeInput): Promise<void> {
    if (input.isJoker) {
      const usage = await this.getJokerUsage(input.employeeId);
      if (usage.usedCount >= usage.maxCount) {
        throw new BadRequestException(
          `Quota de Joker atteint pour cette semaine (${usage.usedCount}/${usage.maxCount}).`,
        );
      }
      // Le Joker bypass la règle de lead time : on ne valide pas le délai.
      return;
    }

    const code = (input.leaveTypeCode ?? '').toLowerCase();
    if (!LeaveRequestService.LEAVE_TYPES_REQUIRING_LEAD.has(code)) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minStart = new Date(today);
    minStart.setDate(minStart.getDate() + LeaveRequestService.LEAVE_REQUEST_LEAD_DAYS);

    const start = new Date(input.startDate);
    start.setHours(0, 0, 0, 0);

    if (start.getTime() < minStart.getTime()) {
      throw new BadRequestException(
        `Toute demande de "${code}" doit être effectuée au minimum ${LeaveRequestService.LEAVE_REQUEST_LEAD_DAYS} jours avant la date de début.`,
      );
    }
  }

  async createWithCode(input: CreateWithCodeInput) {
    await this.assertLeaveRequestPolicy(input);

    let leaveTypeId = input.leaveTypeId;

    // Find leave type by code if provided
    if (!leaveTypeId && input.leaveTypeCode) {
      const leaveTypeRepo = this.dataSource.getRepository(LeaveType);
      let leaveType = await leaveTypeRepo.findOne({
        where: { code: input.leaveTypeCode },
      });

      if (!leaveType) {
        // Create default leave types if they don't exist
        const defaultTypes = [
          { code: 'permission', name: 'Permission', requiresApproval: true, isPaid: false, daysPerYear: 0 },
          { code: 'conge_paye', name: 'Congé payé', requiresApproval: true, isPaid: true, daysPerYear: 30 },
          { code: 'maladie', name: 'Maladie', requiresApproval: true, isPaid: false, daysPerYear: 0 },
          { code: 'autre', name: 'Autre', requiresApproval: true, isPaid: false, daysPerYear: 0 },
        ];

        for (const type of defaultTypes) {
          const existing = await leaveTypeRepo.findOne({ where: { code: type.code } });
          if (!existing) {
            const newType = leaveTypeRepo.create({
              code: type.code,
              name: type.name,
              requiresApproval: type.requiresApproval,
              isPaid: type.isPaid,
              daysPerYear: type.daysPerYear,
              organizationId: input.organizationId || null,
            });
            await leaveTypeRepo.save(newType);
          }
        }

        // Now find the requested type
        leaveType = await leaveTypeRepo.findOne({
          where: { code: input.leaveTypeCode },
        });
      }

      if (leaveType) {
        leaveTypeId = leaveType.id;
      }
    }

    if (!leaveTypeId) {
      throw new Error('Type de congé non trouvé');
    }

    const entity = this.repo.create({
      employeeId: input.employeeId,
      leaveTypeId,
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
      isJoker: input.isJoker ?? false,
      isPartial: input.isPartial ?? false,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      attachments: input.attachments ?? [],
      status: 'pending',
    });
    return this.repo.save(entity);
  }

  // Limite hebdomadaire de Jokers par employé.
  private static readonly JOKER_MAX_PER_WEEK = 1;

  // Délai minimum (en jours) avant la date de début pour les types
  // soumis à anticipation (congé payé, autre). Joker bypass ce délai.
  private static readonly LEAVE_REQUEST_LEAD_DAYS = 14;
  private static readonly LEAVE_TYPES_REQUIRING_LEAD: ReadonlySet<string> = new Set([
    'conge_paye',
    'autre',
  ]);

  async getJokerUsage(employeeId: string) {
    // Lundi 00:00 de la semaine courante
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const weekStart = new Date(now);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);

    const jokerCount = await this.repo
      .createQueryBuilder('lr')
      .where('lr.employee_id = :employeeId', { employeeId })
      .andWhere('lr.is_joker = true')
      .andWhere('lr.created_at >= :weekStart', { weekStart })
      .getCount();

    return {
      weekStart: weekStart.toISOString(),
      usedCount: jokerCount,
      maxCount: LeaveRequestService.JOKER_MAX_PER_WEEK,
    };
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
