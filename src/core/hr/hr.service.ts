import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource, EntityManager } from 'typeorm';
import { Employee } from './employee.entity';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organizations.entity';
import { UsersService } from '../users/users.service';
import { LeaveDeductionHistory, DeductionAbsenceType } from './entities/leave-deduction-history.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';

interface CreateEmployeeInput {
  userId?: string | null;
  organizationId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  hrManagerId?: string | null;
  referralEmployeeId?: string | null;
  employeeNumber?: string | null;
  socialSecurityNumber?: string | null;
  taxId?: string | null;
  jobTitle?: string | null;
  employmentType?: string | null;
  contractType?: string | null;
  contractStartDate: Date;
  contractEndDate?: Date | null;
  probationEndDate?: Date | null;
  noticePeriodDays?: number;
  baseSalary?: number | null;
  salaryCurrency?: string;
  paymentFrequency?: string;
  birthPlace?: string | null;
  maritalStatus?: string | null;
  dependentsCount?: number;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactEmail?: string | null;
  employmentStatus?: string;
  terminationDate?: Date | null;
  terminationReason?: string | null;
  rehireEligible?: boolean;
  hireSource?: string | null;
  badges?: string[];
  workStartTime?: string | null;
  workEndTime?: string | null;
  workDays?: string[];
  annualLeaveDays?: number | null;
}

interface ListEmployeesOptions {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  employmentStatus?: string;
  contractType?: string;
}

interface UpdateEmployeeInput {
  userId?: string | null;
  organizationId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  hrManagerId?: string | null;
  referralEmployeeId?: string | null;
  employeeNumber?: string;
  socialSecurityNumber?: string | null;
  taxId?: string | null;
  jobTitle?: string | null;
  employmentType?: string | null;
  contractType?: string | null;
  contractStartDate?: Date;
  contractEndDate?: Date | null;
  probationEndDate?: Date | null;
  noticePeriodDays?: number;
  baseSalary?: number | null;
  salaryCurrency?: string;
  paymentFrequency?: string;
  birthPlace?: string | null;
  birthDate?: string | null;
  maritalStatus?: string | null;
  dependentsCount?: number;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactEmail?: string | null;
  employmentStatus?: string;
  terminationDate?: Date | null;
  terminationReason?: string | null;
  rehireEligible?: boolean;
  hireSource?: string | null;
  badges?: string[];
  workStartTime?: string | null;
  workEndTime?: string | null;
  workDays?: string[];
  annualLeaveDays?: number | null;
}

@Injectable()
export class HrService {
  private readonly logger = new Logger(HrService.name);

  constructor(
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
    @InjectRepository(LeaveDeductionHistory)
    private readonly deductionHistoryRepo: Repository<LeaveDeductionHistory>,
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly inAppNotificationService: InAppNotificationService,
  ) { }

  // Lier les employés aux users par email (réparation)
  async linkEmployeesToUsersByEmail(organizationId: string): Promise<{ linked: number; details: string[] }> {
    const details: string[] = [];

    // Utiliser une requête SQL brute pour mettre à jour les employees.user_id
    // en joignant avec users par email
    const result = await this.employeesRepo.query(`
      UPDATE module_c_rh.employees e
      SET user_id = u.id
      FROM core.users u
      WHERE e.organization_id = $1
        AND e.user_id IS NULL
        AND e.deleted_at IS NULL
        AND u.organization_id = $1
        AND u.deleted_at IS NULL
        AND LOWER(e.email) = LOWER(u.email)
      RETURNING e.id, e.employee_number, e.email
    `, [organizationId]);

    const linked = result?.length || 0;

    if (linked > 0) {
      for (const row of result) {
        details.push(`Employé ${row.employee_number || row.id} (${row.email}) lié au user correspondant`);
      }
    } else {
      details.push('Aucun employé lié - vérifiez que les emails correspondent entre employees et users');
    }

    return { linked, details };
  }

  async findPageForTenant(
    organizationId: string,
    options: ListEmployeesOptions,
  ) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit =
      options.limit && options.limit > 0 && options.limit <= 100
        ? options.limit
        : 20;

    const qb = this.employeesRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.department', 'department')
      .leftJoinAndSelect('e.user', 'user')
      .leftJoinAndSelect('e.manager', 'manager')
      .where('e.organization_id = :orgId', { orgId: organizationId });

    if (options.departmentId) {
      qb.andWhere('e.department_id = :deptId', {
        deptId: options.departmentId,
      });
    }

    if (options.employmentStatus) {
      qb.andWhere('e.employment_status = :status', { status: options.employmentStatus });
    }

    if (options.contractType) {
      qb.andWhere('e.contract_type = :contractType', { contractType: options.contractType });
    }

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(e.job_title) LIKE :term OR LOWER(e.employee_number) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('e.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOneForTenant(organizationId: string, id: string) {
    return this.employeesRepo.findOne({
      where: { id, organizationId },
      relations: ['department', 'user', 'manager', 'hrManager'],
    });
  }


  async createForTenant(
    organizationId: string,
    createdBy: string | null,
    input: CreateEmployeeInput,
  ): Promise<Employee> {
    const userId = input.userId ?? null;

    if (!userId) {
      throw new BadRequestException('userId est obligatoire');
    }

    const employeeNumber = input.employeeNumber?.trim() || await this.getNextEmployeeNumber(organizationId);

    try {
      const employee = this.employeesRepo.create({
        organizationId,
        userId,
        departmentId: input.departmentId ?? null,
        positionId: input.positionId ?? null,
        managerId: input.managerId ?? null,
        hrManagerId: input.hrManagerId ?? null,
        referralEmployeeId: input.referralEmployeeId ?? null,
        employeeNumber,
        socialSecurityNumber: input.socialSecurityNumber ?? null,
        taxId: input.taxId ?? null,
        jobTitle: input.jobTitle ?? null,
        employmentType: input.employmentType ?? null,
        contractType: input.contractType ?? null,
        contractStartDate: input.contractStartDate,
        contractEndDate: input.contractEndDate ?? null,
        probationEndDate: input.probationEndDate ?? null,
        noticePeriodDays: input.noticePeriodDays ?? 30,
        baseSalary: input.baseSalary ?? null,
        salaryCurrency: input.salaryCurrency ?? 'XOF',
        paymentFrequency: input.paymentFrequency ?? 'monthly',
        birthPlace: input.birthPlace ?? null,
        maritalStatus: input.maritalStatus ?? null,
        dependentsCount: input.dependentsCount ?? 0,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactRelationship: input.emergencyContactRelationship ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
        emergencyContactEmail: input.emergencyContactEmail ?? null,
        employmentStatus: input.employmentStatus ?? 'active',
        terminationDate: input.terminationDate ?? null,
        terminationReason: input.terminationReason ?? null,
        rehireEligible: input.rehireEligible ?? true,
        hireSource: input.hireSource ?? null,
        badges: input.badges && input.badges.length > 0 ? input.badges : undefined,
        workStartTime: input.workStartTime ?? null,
        workEndTime: input.workEndTime ?? null,
        workDays: input.workDays && input.workDays.length > 0 ? input.workDays : undefined,
        annualLeaveDays: input.annualLeaveDays ?? null,
      });

      const saved = await this.employeesRepo.save(employee);
      return saved;
    } catch (error) {
      console.error('[HrService] Error creating employee:', error);
      throw error;
    }
  }

  async updateForTenant(
    organizationId: string,
    id: string,
    _updatedBy: string | null,
    input: UpdateEmployeeInput,
  ) {
    const patch: Partial<Employee> = {};

    if (input.userId !== undefined) patch.userId = input.userId;
    if (input.organizationId !== undefined) patch.organizationId = input.organizationId;
    if (input.departmentId !== undefined) patch.departmentId = input.departmentId;
    if (input.positionId !== undefined) patch.positionId = input.positionId;
    if (input.managerId !== undefined) patch.managerId = input.managerId;
    if (input.hrManagerId !== undefined) patch.hrManagerId = input.hrManagerId;
    if (input.referralEmployeeId !== undefined) patch.referralEmployeeId = input.referralEmployeeId;
    if (input.employeeNumber) patch.employeeNumber = input.employeeNumber;
    if (input.socialSecurityNumber !== undefined) patch.socialSecurityNumber = input.socialSecurityNumber;
    if (input.taxId !== undefined) patch.taxId = input.taxId;
    if (input.jobTitle) patch.jobTitle = input.jobTitle;
    if (input.employmentType) patch.employmentType = input.employmentType;
    if (input.contractType) patch.contractType = input.contractType;
    if (input.contractStartDate) patch.contractStartDate = input.contractStartDate;
    if (input.contractEndDate !== undefined) patch.contractEndDate = input.contractEndDate;
    if (input.probationEndDate !== undefined) patch.probationEndDate = input.probationEndDate;
    if (input.noticePeriodDays !== undefined) patch.noticePeriodDays = input.noticePeriodDays;
    if (input.baseSalary !== undefined) patch.baseSalary = input.baseSalary;
    if (input.salaryCurrency) patch.salaryCurrency = input.salaryCurrency;
    if (input.paymentFrequency) patch.paymentFrequency = input.paymentFrequency;
    if (input.birthPlace !== undefined) patch.birthPlace = input.birthPlace;
    if (input.birthDate !== undefined) patch.birthDate = input.birthDate ? new Date(input.birthDate) : null;
    if (input.maritalStatus !== undefined) patch.maritalStatus = input.maritalStatus;
    if (input.dependentsCount !== undefined) patch.dependentsCount = input.dependentsCount;
    if (input.emergencyContactName !== undefined) patch.emergencyContactName = input.emergencyContactName;
    if (input.emergencyContactRelationship !== undefined) patch.emergencyContactRelationship = input.emergencyContactRelationship;
    if (input.emergencyContactPhone !== undefined) patch.emergencyContactPhone = input.emergencyContactPhone;
    if (input.emergencyContactEmail !== undefined) patch.emergencyContactEmail = input.emergencyContactEmail;
    if (input.employmentStatus) patch.employmentStatus = input.employmentStatus;
    if (input.terminationDate !== undefined) patch.terminationDate = input.terminationDate;
    if (input.terminationReason !== undefined) patch.terminationReason = input.terminationReason;
    if (input.rehireEligible !== undefined) patch.rehireEligible = input.rehireEligible;
    if (input.hireSource !== undefined) patch.hireSource = input.hireSource;
    if (input.badges !== undefined) patch.badges = input.badges;
    if (input.workStartTime !== undefined) patch.workStartTime = input.workStartTime;
    if (input.workEndTime !== undefined) patch.workEndTime = input.workEndTime;
    if (input.workDays !== undefined) patch.workDays = input.workDays;
    if (input.annualLeaveDays !== undefined) patch.annualLeaveDays = input.annualLeaveDays;

    console.log('[HrService] updateForTenant patch keys:', Object.keys(patch));
    console.log('[HrService] updateForTenant patch values:', JSON.stringify(patch));

    if (Object.keys(patch).length === 0) {
      console.log('[HrService] updateForTenant: empty patch, skipping update');
      return this.employeesRepo.findOne({
        where: { id, organizationId },
        relations: ['department', 'user', 'manager'],
      });
    }

    // Use save() instead of update() so TypeORM column transformers (simple-array) are applied
    try {
      const existing = await this.employeesRepo.findOne({ where: { id, organizationId } });
      if (!existing) throw new Error('Employé non trouvé');
      const merged = Object.assign(existing, patch);
      const saved = await this.employeesRepo.save(merged);
      console.log('[HrService] updateForTenant saved successfully, id:', saved.id);
    } catch (err) {
      console.error('[HrService] updateForTenant DB error:', err);
      throw err;
    }

    return this.employeesRepo.findOne({
      where: { id, organizationId },
      relations: ['department', 'user', 'manager'],
    });
  }

  async softDeleteForTenant(
    organizationId: string,
    id: string,
    _userId: string | null,
  ) {
    await this.employeesRepo.update(
      { id, organizationId },
      { employmentStatus: 'terminated' },
    );
  }

  async restoreForTenant(
    organizationId: string,
    id: string,
    _userId: string | null,
  ) {
    await this.employeesRepo.update(
      { id, organizationId },
      { employmentStatus: 'active' },
    );
  }

  async hardDeleteForTenant(organizationId: string, id: string) {
    await this.employeesRepo.delete({ id, organizationId });
  }

  async bulkActionForTenant(
    organizationId: string,
    _userId: string | null,
    action: 'terminate' | 'restore' | 'activate' | 'suspend',
    ids: string[],
  ) {
    if (!ids || ids.length === 0) {
      return { affected: 0 };
    }

    const where = { id: In(ids), organizationId } as any;

    let patch: Partial<Employee>;
    switch (action) {
      case 'terminate':
        patch = { employmentStatus: 'terminated' };
        break;
      case 'restore':
        patch = { employmentStatus: 'active' };
        break;
      case 'activate':
        patch = { employmentStatus: 'active' };
        break;
      case 'suspend':
        patch = { employmentStatus: 'suspended' };
        break;
      default:
        throw new Error('Unsupported bulk action');
    }

    const result = await this.employeesRepo.update(where, patch as any);
    return { affected: result.affected ?? 0 };
  }
  async findUsersWithoutEmployee(organizationId: string, search?: string) {
    // First, get all user IDs that already have an employee record
    const existingEmployees = await this.employeesRepo
      .createQueryBuilder('e')
      .select(['e.userId'])
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.userId IS NOT NULL')
      .getMany();

    const userIdsWithEmployee = existingEmployees
      .map((e) => e.userId)
      .filter((id): id is string => !!id);

    // Find users without employee record
    const qb = this.usersRepo
      .createQueryBuilder('u')
      .where('u.organizationId = :orgId', { orgId: organizationId })
      .andWhere('u.deletedAt IS NULL')
      .andWhere('u.isActive = true');

    // Only add NOT IN condition if there are users with employee records
    if (userIdsWithEmployee.length > 0) {
      qb.andWhere('u.id NOT IN (:...userIdsWithEmployee)', { userIdsWithEmployee });
    }

    if (search && search.trim().length > 0) {
      const term = `%${search.toLowerCase().trim()}%`;
      qb.andWhere(
        '(LOWER(u.firstName) LIKE :term OR LOWER(u.lastName) LIKE :term OR LOWER(u.email) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('u.firstName', 'ASC').limit(50);

    const users = await qb.getMany();

    // Extract department IDs from user metadata
    const departmentIds = users
      .map((u) => {
        const metadata = u.metadata as Record<string, unknown> | null;
        return metadata?.department as string | undefined;
      })
      .filter((id): id is string => !!id);

    // Fetch departments if any
    let departments: Map<string, { id: string; name: string; code: string }> = new Map();
    if (departmentIds.length > 0) {
      const deptRepo = this.employeesRepo.manager.getRepository('Department');
      const depts = await deptRepo
        .createQueryBuilder('d')
        .where('d.id IN (:...ids)', { ids: departmentIds })
        .getMany();

      departments = new Map(depts.map((d: any) => [d.id, { id: d.id, name: d.name, code: d.code }]));
    }

    // Attach department info to users
    return users.map((u) => {
      const metadata = u.metadata as Record<string, unknown> | null;
      const deptId = metadata?.department as string | undefined;
      return {
        ...u,
        department: deptId ? departments.get(deptId) || null : null,
      };
    });
  }

  async getNextEmployeeNumber(organizationId: string): Promise<string> {
    // Find the highest employee number for this organization
    const result = await this.employeesRepo
      .createQueryBuilder('e')
      .select('e.employeeNumber', 'employeeNumber')
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.employeeNumber LIKE :prefix', { prefix: 'LYDER-%' })
      .orderBy('e.employeeNumber', 'DESC')
      .limit(1)
      .getRawOne();

    if (!result || !result.employeeNumber) {
      return 'LYDER-00001';
    }

    const currentNumber = result.employeeNumber as string;
    const hexPart = currentNumber.replace('LYDER-', '');

    const currentNumeric = parseInt(hexPart, 16);
    const nextNumeric = currentNumeric + 1;

    const nextHex = nextNumeric.toString(16).toUpperCase().padStart(5, '0');

    return `LYDER-${nextHex}`;
  }

  async getStatsForTenant(organizationId: string) {
    const total = await this.employeesRepo.count({
      where: { organizationId, employmentStatus: 'active' },
    });

    const byDepartment = await this.employeesRepo
      .createQueryBuilder('e')
      .select('e.department_id', 'departmentId')
      .addSelect('COUNT(*)', 'count')
      .where('e.organization_id = :orgId', { orgId: organizationId })
      .andWhere('e.employment_status = :status', { status: 'active' })
      .groupBy('e.department_id')
      .getRawMany();

    const byStatus = await this.employeesRepo
      .createQueryBuilder('e')
      .select('e.employment_status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('e.organization_id = :orgId', { orgId: organizationId })
      .groupBy('e.employment_status')
      .getRawMany();

    const byContractType = await this.employeesRepo
      .createQueryBuilder('e')
      .select('e.contract_type', 'contractType')
      .addSelect('COUNT(*)', 'count')
      .where('e.organization_id = :orgId', { orgId: organizationId })
      .andWhere('e.employment_status = :status', { status: 'active' })
      .groupBy('e.contract_type')
      .getRawMany();

    return {
      total,
      byDepartment,
      byStatus,
      byContractType,
    };
  }

  async updateScheduleForTenant(
    organizationId: string,
    employeeId: string,
    input: { workStartTime?: string | null; workEndTime?: string | null; workDays?: string[]; annualLeaveDays?: number | null },
  ) {
    const employee = await this.employeesRepo.findOne({
      where: { id: employeeId, organizationId },
    });

    if (!employee) {
      throw new Error('Employé non trouvé');
    }

    employee.workStartTime = input.workStartTime ?? null;
    employee.workEndTime = input.workEndTime ?? null;
    employee.workDays = input.workDays ?? [];
    employee.annualLeaveDays = input.annualLeaveDays ?? null;

    return this.employeesRepo.save(employee);
  }
  async getScheduleForTenant(
    organizationId: string,
    employeeId: string
  ) {
    const employee = await this.employeesRepo.findOne({
      where: { id: employeeId, organizationId },
      select: ['workStartTime', 'workEndTime', 'workDays', 'annualLeaveDays'],
    });
    return employee;
  }

  async findByUserIds(
    organizationId: string,
    userIds: string[]) {
    return this.employeesRepo.find({
      where: {
        organizationId,
        userId: In(userIds),
      },
    });
  }

  /**
   * Calculate leave usage for an employee based on attendance data.
   * Formula: usedDays = absentDays + (lateHours / workHoursPerDay) + (earlyLeaveHours / workHoursPerDay) + approvedLeaveDays
   * remainingDays = annualLeaveDays - usedDays
   */
  async getLeaveUsage(
    organizationId: string,
    employeeId: string,
    year?: number,
  ) {
    const employee = await this.employeesRepo.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) throw new Error('Employé non trouvé');

    const targetYear = year ?? new Date().getFullYear();
    const yearStart = `${targetYear}-01-01`;
    const yearEnd = `${targetYear}-12-31`;

    const annualLeaveDays = employee.annualLeaveDays ?? 0;

    // Calcul dynamique de la journée de travail : différence entre
    // workEndTime et workStartTime de l'employé. Fallback 8h si l'horaire
    // n'est pas configuré (ex: nouvel employé). Une journée < 1h est
    // refusée (config invalide) → on garde 8h.
    const workHoursPerDay = this.computeWorkHoursPerDay(
      employee.workStartTime,
      employee.workEndTime,
    );

    // Query attendance records for the year using raw SQL
    const attendanceRecords: any[] = await this.dataSource.query(
      `SELECT id, employee_id, organization_id, attendance_date,
              scheduled_check_in, scheduled_check_out,
              actual_check_in, actual_check_out,
              scheduled_hours, actual_hours,
              status, is_justified, notes,
              deducted_from_leave
       FROM module_c_rh.office_attendances
       WHERE employee_id = $1 AND organization_id = $2
         AND attendance_date >= $3 AND attendance_date <= $4
         AND deleted_at IS NULL
       ORDER BY attendance_date ASC`,
      [employeeId, organizationId, yearStart, yearEnd],
    );

    // Count absent days (unjustified)
    const absentDays = attendanceRecords.filter(
      (r: any) => r.status === 'absent' && !r.is_justified,
    ).length;

    // Count justified absent days (count as used leave)
    const justifiedAbsentDays = attendanceRecords.filter(
      (r: any) => r.status === 'absent' && r.is_justified,
    ).length;

    // Calculate late hours: difference between scheduled start and actual check-in
    let lateHours = 0;
    const lateRecords = attendanceRecords.filter(
      (r: any) => r.status === 'late',
    );
    for (const r of lateRecords) {
      if (r.scheduled_check_in && r.actual_check_in) {
        const scheduled = this.timeToMinutes(r.scheduled_check_in);
        const actual = this.timeToMinutes(r.actual_check_in);
        const diffMinutes = actual - scheduled;
        if (diffMinutes > 0) lateHours += diffMinutes / 60;
      } else {
        lateHours += 1; // default 1h per late if no times
      }
    }

    // Calculate early leave hours: difference between scheduled end and actual check-out
    let earlyLeaveHours = 0;
    const earlyLeaveRecords = attendanceRecords.filter(
      (r: any) => r.status === 'early_leave',
    );
    for (const r of earlyLeaveRecords) {
      if (r.scheduled_check_out && r.actual_check_out) {
        const scheduled = this.timeToMinutes(r.scheduled_check_out);
        const actual = this.timeToMinutes(r.actual_check_out);
        const diffMinutes = scheduled - actual;
        if (diffMinutes > 0) earlyLeaveHours += diffMinutes / 60;
      } else {
        earlyLeaveHours += 1; // default 1h per early leave
      }
    }

    // Convert hours to days using the employee's actual work-day duration.
    const lateDays = Math.round((lateHours / workHoursPerDay) * 100) / 100;
    const earlyLeaveDays = Math.round((earlyLeaveHours / workHoursPerDay) * 100) / 100;

    // Get approved leave requests for the year — JOIN sur leave_types pour
    // récupérer le code (maladie/permission/conge_paye) afin de distinguer
    // les types dans le breakdown et l'UI.
    const leaveRequests: Array<{
      id: string;
      employee_id: string;
      start_date: string;
      end_date: string;
      total_days: string | number;
      status: string;
      deducted_from_leave: boolean;
      leave_type_code: string | null;
      leave_type_name: string | null;
    }> = await this.dataSource.query(
      `SELECT lr.id, lr.employee_id, lr.start_date, lr.end_date,
              lr.total_days, lr.status, lr.deducted_from_leave,
              lt.code AS leave_type_code, lt.name AS leave_type_name
       FROM module_c_rh.leave_requests lr
       LEFT JOIN module_c_rh.leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.employee_id = $1 AND lr.status = $2
         AND lr.start_date >= $3 AND lr.end_date <= $4`,
      [employeeId, 'approved', yearStart, yearEnd],
    );

    // Ventilation des congés approuvés par type. Permet à l'UI d'afficher
    // séparément maladie / permission / congé payé, sans recalcul côté front.
    const leaveByType: Record<string, number> = {};
    let approvedLeaveDays = 0;
    for (const r of leaveRequests) {
      const days = parseFloat(String(r.total_days ?? '0')) || 0;
      approvedLeaveDays += days;
      const code = (r.leave_type_code ?? 'autre').toLowerCase();
      leaveByType[code] = (leaveByType[code] ?? 0) + days;
    }

    // Total used days
    const usedDays = Math.round(
      (absentDays + justifiedAbsentDays + lateDays + earlyLeaveDays + approvedLeaveDays) * 100,
    ) / 100;
    // remainingDays peut être négatif (découvert) — c'est intentionnel : la
    // RH veut voir les dépassements pour les régulariser, pas les masquer.
    const remainingDays = Math.round((annualLeaveDays - usedDays) * 100) / 100;

    // Build detail items for admin view.
    // `applied` reflète maintenant le flag persistant deducted_from_leave
    // (action explicite RH), pas un état dérivé.
    const details = [
      ...attendanceRecords
        .filter((r: any) => r.status === 'absent')
        .map((r: any) => ({
          id: r.id,
          recordType: 'attendance' as const,
          date: r.attendance_date,
          type: r.is_justified ? 'absence_justifiee' : 'absence',
          label: r.is_justified ? 'Absence justifiée' : 'Absence',
          hours: workHoursPerDay,
          daysEquivalent: 1,
          applied: !!r.deducted_from_leave,
        })),
      ...lateRecords.map((r: any) => {
        let hours = 1;
        if (r.scheduled_check_in && r.actual_check_in) {
          const diff = this.timeToMinutes(r.actual_check_in) - this.timeToMinutes(r.scheduled_check_in);
          if (diff > 0) hours = Math.round((diff / 60) * 100) / 100;
        }
        return {
          id: r.id,
          recordType: 'attendance' as const,
          date: r.attendance_date,
          type: 'retard',
          label: 'Retard',
          hours,
          daysEquivalent: Math.round((hours / workHoursPerDay) * 100) / 100,
          applied: !!r.deducted_from_leave,
        };
      }),
      ...earlyLeaveRecords.map((r: any) => {
        let hours = 1;
        if (r.scheduled_check_out && r.actual_check_out) {
          const diff = this.timeToMinutes(r.scheduled_check_out) - this.timeToMinutes(r.actual_check_out);
          if (diff > 0) hours = Math.round((diff / 60) * 100) / 100;
        }
        return {
          id: r.id,
          recordType: 'attendance' as const,
          date: r.attendance_date,
          type: 'depart_anticipe',
          label: 'Départ anticipé',
          hours,
          daysEquivalent: Math.round((hours / workHoursPerDay) * 100) / 100,
          applied: !!r.deducted_from_leave,
        };
      }),
      ...leaveRequests.map((r) => {
        const code = (r.leave_type_code ?? 'autre').toLowerCase();
        const days = parseFloat(String(r.total_days ?? '1')) || 1;
        // Mapping code → type/label pour l'UI. Les codes inconnus tombent
        // dans le bucket "conge_approuve" générique (rétro-compatible).
        const { type, label } = this.mapLeaveTypeCodeToDetail(code, r.leave_type_name);
        return {
          id: r.id,
          recordType: 'leave_request' as const,
          date: r.start_date,
          type,
          label,
          leaveTypeCode: code,
          hours: days * workHoursPerDay,
          daysEquivalent: days,
          applied: !!r.deducted_from_leave,
        };
      }),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      employeeId,
      annualLeaveDays,
      usedDays,
      // Pas de Math.max : un solde négatif est une info que la RH doit voir.
      remainingDays,
      workHoursPerDay,
      breakdown: {
        absentDays,
        justifiedAbsentDays,
        lateDays,
        earlyLeaveDays,
        approvedLeaveDays,
        lateHours: Math.round(lateHours * 100) / 100,
        earlyLeaveHours: Math.round(earlyLeaveHours * 100) / 100,
        // Ventilation par type de congé pour l'affichage détaillé.
        leaveByType,
      },
      details,
      year: targetYear,
    };
  }

  /**
   * Calcule le nombre d'heures de travail journalières d'un employé à partir
   * de ses horaires (workStartTime / workEndTime). Fallback 8h.
   */
  private computeWorkHoursPerDay(
    workStartTime?: string | null,
    workEndTime?: string | null,
  ): number {
    const fallback = 8;
    if (!workStartTime || !workEndTime) return fallback;
    const start = this.timeToMinutes(workStartTime);
    const end = this.timeToMinutes(workEndTime);
    const diffMin = end - start;
    if (diffMin <= 0) return fallback;
    return Math.round((diffMin / 60) * 100) / 100;
  }

  /**
   * Mappe un `leave_type.code` (ex: 'maladie', 'permission', 'conge_paye')
   * vers le couple (type interne, label affichable) utilisé dans `details[]`.
   * Permet à l'UI de colorer/grouper les détails par catégorie sans logique
   * supplémentaire.
   */
  private mapLeaveTypeCodeToDetail(
    code: string,
    leaveTypeName: string | null,
  ): { type: string; label: string } {
    switch (code) {
      case 'maladie':
        return { type: 'maladie', label: 'Maladie' };
      case 'permission':
        return { type: 'permission', label: 'Permission' };
      case 'conge_paye':
      case 'paid_leave':
        return { type: 'conge_paye', label: 'Congé payé' };
      case 'joker':
        return { type: 'joker', label: 'Joker' };
      default:
        return {
          type: 'conge_approuve',
          label: leaveTypeName ?? 'Congé approuvé',
        };
    }
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Marque les enregistrements sélectionnés comme "déduits du solde de congés"
   * et insère une ligne dans `leave_deduction_histories` pour chaque
   * application (avec ancien/nouveau solde). Opération idempotente : un
   * record déjà appliqué est ignoré (pas d'erreur, pas de doublon en historique).
   *
   * Notifications :
   *   - Employé : "X jours déduits par <admin>" (in-app)
   *   - RH admins : si solde devient négatif → alerte
   *
   * @returns récapitulatif + nouveau solde + entries d'historique créées
   */
  async applyLeaveDeduction(
    organizationId: string,
    employeeId: string,
    appliedBy: string | null,
    records: Array<{ id: string; type: 'attendance' | 'leave_request' }>,
  ): Promise<{
    appliedAttendances: number;
    appliedLeaveRequests: number;
    totalDaysDeducted: number;
    previousRemainingDays: number;
    newRemainingDays: number;
    historyEntries: LeaveDeductionHistory[];
  }> {
    const employee = await this.employeesRepo.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new BadRequestException('Employé non trouvé');
    }

    // Snapshot du solde AVANT déduction (pour l'historique). Une seule
    // requête getLeaveUsage : on a besoin de remainingDays + workHoursPerDay.
    const usageBefore = await this.getLeaveUsage(organizationId, employeeId);
    const workHoursPerDay = usageBefore.workHoursPerDay || 8;
    let runningRemaining = usageBefore.remainingDays;

    const attendanceIds = records.filter(r => r.type === 'attendance').map(r => r.id);
    const leaveIds = records.filter(r => r.type === 'leave_request').map(r => r.id);

    let appliedAttendances = 0;
    let appliedLeaveRequests = 0;
    let totalDaysDeducted = 0;
    const historyEntries: LeaveDeductionHistory[] = [];

    await this.dataSource.transaction(async (manager) => {
      const historyRepo = manager.getRepository(LeaveDeductionHistory);

      if (attendanceIds.length > 0) {
        // Étape 1 : SELECT des attendances éligibles (non déjà déduites).
        // On ne fait pas un UPDATE ... RETURNING parce que le mapping de
        // RETURNING via manager.query() est parfois capricieux selon la
        // version du driver pg → on préfère SELECT puis UPDATE séparés
        // (toujours dans la même transaction, donc atomique).
        const eligible: Array<{
          id: string;
          status: string;
          scheduled_check_in: string | null;
          scheduled_check_out: string | null;
          actual_check_in: string | null;
          actual_check_out: string | null;
          is_justified: boolean;
        }> = await manager.query(
          `SELECT id, status, scheduled_check_in, scheduled_check_out,
                  actual_check_in, actual_check_out, is_justified
             FROM module_c_rh.office_attendances
            WHERE id = ANY($1::uuid[])
              AND employee_id = $2
              AND organization_id = $3
              AND deducted_from_leave = false
              AND deleted_at IS NULL`,
          [attendanceIds, employeeId, organizationId],
        );

        if (eligible.length > 0) {
          const eligibleIds = eligible.map(r => r.id);
          // Étape 2 : UPDATE en bloc.
          await manager.query(
            `UPDATE module_c_rh.office_attendances
                SET deducted_from_leave = true,
                    deducted_at = NOW(),
                    deducted_by = $2
              WHERE id = ANY($1::uuid[])`,
            [eligibleIds, appliedBy],
          );
          appliedAttendances = eligible.length;

          // Étape 3 : insertion des lignes d'historique.
          for (const r of eligible) {
            if (!r.id) {
              this.logger.warn('Skip history insert : attendance row sans id');
              continue;
            }
            const { hours, days, absenceType } = this.computeAttendanceDeductionDelta(r, workHoursPerDay);
            totalDaysDeducted += days;

            const previousRemaining = runningRemaining;
            runningRemaining = Math.round((runningRemaining - days) * 100) / 100;

            const entry = await historyRepo.save(
              historyRepo.create({
                employeeId,
                organizationId,
                appliedBy,
                recordType: 'attendance',
                recordId: r.id,
                absenceType,
                hours: hours.toFixed(2),
                daysEquivalent: days.toFixed(2),
                previousRemainingDays: previousRemaining.toFixed(2),
                newRemainingDays: runningRemaining.toFixed(2),
                isCancellation: false,
                comment: null,
              }),
            );
            historyEntries.push(entry);
          }
        }
      }

      if (leaveIds.length > 0) {
        // Même pattern : SELECT puis UPDATE.
        const eligible: Array<{
          id: string;
          total_days: string;
          leave_type_code: string | null;
        }> = await manager.query(
          `SELECT lr.id, lr.total_days, lt.code AS leave_type_code
             FROM module_c_rh.leave_requests lr
             INNER JOIN module_c_rh.employees e ON e.id = lr.employee_id
             LEFT JOIN module_c_rh.leave_types lt ON lt.id = lr.leave_type_id
            WHERE lr.id = ANY($1::uuid[])
              AND lr.employee_id = $2
              AND e.organization_id = $3
              AND lr.deducted_from_leave = false
              AND lr.status = 'approved'`,
          [leaveIds, employeeId, organizationId],
        );

        if (eligible.length > 0) {
          const eligibleIds = eligible.map(r => r.id);
          await manager.query(
            `UPDATE module_c_rh.leave_requests
                SET deducted_from_leave = true,
                    deducted_at = NOW(),
                    deducted_by = $2
              WHERE id = ANY($1::uuid[])`,
            [eligibleIds, appliedBy],
          );
          appliedLeaveRequests = eligible.length;

          for (const r of eligible) {
            if (!r.id) {
              this.logger.warn('Skip history insert : leave_request row sans id');
              continue;
            }
            const days = parseFloat(r.total_days ?? '0') || 0;
            totalDaysDeducted += days;

            const previousRemaining = runningRemaining;
            runningRemaining = Math.round((runningRemaining - days) * 100) / 100;

            const absenceType = this.leaveCodeToAbsenceType(r.leave_type_code);

            const entry = await historyRepo.save(
              historyRepo.create({
                employeeId,
                organizationId,
                appliedBy,
                recordType: 'leave_request',
                recordId: r.id,
                absenceType,
                hours: (days * workHoursPerDay).toFixed(2),
                daysEquivalent: days.toFixed(2),
                previousRemainingDays: previousRemaining.toFixed(2),
                newRemainingDays: runningRemaining.toFixed(2),
                isCancellation: false,
                comment: null,
              }),
            );
            historyEntries.push(entry);
          }
        }
      }
    });

    const total = Math.round(totalDaysDeducted * 100) / 100;
    const newRemainingDays = Math.round(runningRemaining * 100) / 100;

    // Notifications best-effort (ne bloquent pas si le module notif a un pb).
    if (total > 0) {
      void this.notifyDeductionApplied({
        organizationId,
        employeeId,
        userId: employee.userId,
        totalDays: total,
        newRemainingDays,
        appliedBy,
      });
    }

    return {
      appliedAttendances,
      appliedLeaveRequests,
      totalDaysDeducted: total,
      previousRemainingDays: usageBefore.remainingDays,
      newRemainingDays,
      historyEntries,
    };
  }

  /**
   * Annule une déduction précédemment appliquée. Remet le flag
   * `deducted_from_leave = false` sur le record source, insère une ligne
   * négative dans l'historique (`isCancellation = true`) et notifie.
   */
  async cancelLeaveDeduction(
    organizationId: string,
    employeeId: string,
    appliedBy: string | null,
    input: { recordId: string; recordType: 'attendance' | 'leave_request'; comment?: string | null },
  ): Promise<{
    cancelled: boolean;
    daysRestored: number;
    newRemainingDays: number;
    historyEntry: LeaveDeductionHistory | null;
  }> {
    const employee = await this.employeesRepo.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new BadRequestException('Employé non trouvé');
    }

    // On a besoin du delta initial — on cherche l'entrée la plus récente
    // (non-cancellation) pour ce record.
    const lastApplication = await this.deductionHistoryRepo.findOne({
      where: {
        employeeId,
        recordId: input.recordId,
        recordType: input.recordType,
        isCancellation: false,
      },
      order: { appliedAt: 'DESC' },
    });

    const usageBefore = await this.getLeaveUsage(organizationId, employeeId);
    let runningRemaining = usageBefore.remainingDays;
    let daysRestored = 0;
    let historyEntry: LeaveDeductionHistory | null = null;

    await this.dataSource.transaction(async (manager) => {
      const historyRepo = manager.getRepository(LeaveDeductionHistory);

      const table = input.recordType === 'attendance'
        ? 'module_c_rh.office_attendances'
        : 'module_c_rh.leave_requests';

      const result: Array<{ id: string }> = await manager.query(
        `UPDATE ${table}
            SET deducted_from_leave = false,
                deducted_at = NULL,
                deducted_by = NULL
          WHERE id = $1
            AND employee_id = $2
            ${input.recordType === 'attendance' ? 'AND organization_id = $3' : ''}
            AND deducted_from_leave = true
          RETURNING id`,
        input.recordType === 'attendance'
          ? [input.recordId, employeeId, organizationId]
          : [input.recordId, employeeId],
      );

      if (result.length === 0) {
        // Rien à annuler (déjà annulé ou n'a jamais été appliqué).
        return;
      }

      // Restaurer le delta exact qui avait été déduit lors de l'application.
      const restoredDays = lastApplication
        ? parseFloat(lastApplication.daysEquivalent ?? '0') || 0
        : 0;
      const restoredHours = lastApplication
        ? parseFloat(lastApplication.hours ?? '0') || 0
        : 0;

      daysRestored = restoredDays;
      const previousRemaining = runningRemaining;
      runningRemaining = Math.round((runningRemaining + restoredDays) * 100) / 100;

      historyEntry = await historyRepo.save(
        historyRepo.create({
          employeeId,
          organizationId,
          appliedBy,
          recordType: input.recordType,
          recordId: input.recordId,
          absenceType: lastApplication?.absenceType ?? 'absence',
          hours: (-restoredHours).toFixed(2),
          daysEquivalent: (-restoredDays).toFixed(2),
          previousRemainingDays: previousRemaining.toFixed(2),
          newRemainingDays: runningRemaining.toFixed(2),
          isCancellation: true,
          comment: input.comment ?? null,
        }),
      );
    });

    const newRemainingDays = Math.round(runningRemaining * 100) / 100;

    if (daysRestored > 0) {
      void this.notifyDeductionCancelled({
        organizationId,
        employeeId,
        userId: employee.userId,
        daysRestored,
        newRemainingDays,
        appliedBy,
      });
    }

    return {
      cancelled: daysRestored > 0,
      daysRestored,
      newRemainingDays,
      historyEntry,
    };
  }

  /**
   * Liste l'historique des déductions de congé d'un employé.
   * Inclut le nom de l'admin qui a appliqué chaque opération.
   */
  async getLeaveDeductionHistory(
    organizationId: string,
    employeeId: string,
    year?: number,
  ): Promise<Array<{
    id: string;
    appliedAt: string;
    appliedByName: string | null;
    recordType: string;
    recordId: string;
    absenceType: string;
    hours: number;
    daysEquivalent: number;
    previousRemainingDays: number;
    newRemainingDays: number;
    isCancellation: boolean;
    comment: string | null;
  }>> {
    const employee = await this.employeesRepo.findOne({
      where: { id: employeeId, organizationId },
      select: ['id'],
    });
    if (!employee) {
      throw new BadRequestException('Employé non trouvé');
    }

    const targetYear = year ?? new Date().getFullYear();
    const yearStart = `${targetYear}-01-01`;
    const yearEnd = `${targetYear}-12-31`;

    const rows: Array<{
      id: string;
      applied_at: Date;
      first_name: string | null;
      last_name: string | null;
      record_type: string;
      record_id: string;
      absence_type: string;
      hours: string;
      days_equivalent: string;
      previous_remaining_days: string;
      new_remaining_days: string;
      is_cancellation: boolean;
      comment: string | null;
    }> = await this.dataSource.query(
      `SELECT h.id, h.applied_at, u.first_name, u.last_name,
              h.record_type, h.record_id, h.absence_type,
              h.hours, h.days_equivalent,
              h.previous_remaining_days, h.new_remaining_days,
              h.is_cancellation, h.comment
       FROM module_c_rh.leave_deduction_histories h
       LEFT JOIN core.users u ON u.id = h.applied_by
       WHERE h.employee_id = $1
         AND h.organization_id = $2
         AND h.applied_at >= $3
         AND h.applied_at <= $4
       ORDER BY h.applied_at DESC`,
      [employeeId, organizationId, yearStart, `${yearEnd} 23:59:59`],
    );

    return rows.map(r => ({
      id: r.id,
      appliedAt: r.applied_at.toISOString(),
      appliedByName: [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
      recordType: r.record_type,
      recordId: r.record_id,
      absenceType: r.absence_type,
      hours: parseFloat(r.hours),
      daysEquivalent: parseFloat(r.days_equivalent),
      previousRemainingDays: parseFloat(r.previous_remaining_days),
      newRemainingDays: parseFloat(r.new_remaining_days),
      isCancellation: r.is_cancellation,
      comment: r.comment,
    }));
  }

  // ────────── Helpers internes pour les déductions ──────────

  /**
   * Calcule (heures, jours, type d'absence) à déduire pour un attendance record.
   */
  private computeAttendanceDeductionDelta(
    record: {
      status: string;
      scheduled_check_in: string | null;
      scheduled_check_out: string | null;
      actual_check_in: string | null;
      actual_check_out: string | null;
      is_justified: boolean;
    },
    workHoursPerDay: number,
  ): { hours: number; days: number; absenceType: DeductionAbsenceType } {
    if (record.status === 'absent') {
      return {
        hours: workHoursPerDay,
        days: 1,
        absenceType: record.is_justified ? 'absence_justifiee' : 'absence',
      };
    }
    if (record.status === 'late' && record.scheduled_check_in && record.actual_check_in) {
      const diffMin = this.timeToMinutes(record.actual_check_in) - this.timeToMinutes(record.scheduled_check_in);
      const hours = Math.max(0, diffMin / 60);
      return {
        hours: Math.round(hours * 100) / 100,
        days: Math.round((hours / workHoursPerDay) * 100) / 100,
        absenceType: 'retard',
      };
    }
    if (record.status === 'early_leave' && record.scheduled_check_out && record.actual_check_out) {
      const diffMin = this.timeToMinutes(record.scheduled_check_out) - this.timeToMinutes(record.actual_check_out);
      const hours = Math.max(0, diffMin / 60);
      return {
        hours: Math.round(hours * 100) / 100,
        days: Math.round((hours / workHoursPerDay) * 100) / 100,
        absenceType: 'depart_anticipe',
      };
    }
    // Fallback : 1h
    return { hours: 1, days: Math.round((1 / workHoursPerDay) * 100) / 100, absenceType: 'absence' };
  }

  private leaveCodeToAbsenceType(code: string | null): DeductionAbsenceType {
    switch ((code ?? '').toLowerCase()) {
      case 'maladie': return 'maladie';
      case 'permission': return 'permission';
      case 'conge_paye':
      case 'paid_leave': return 'conge_paye';
      default: return 'conge_approuve';
    }
  }

  /** Trouve les userIds RH d'une organisation (pour notifier en cas de solde négatif). */
  private async findHrAdminUserIds(organizationId: string): Promise<string[]> {
    const rows: Array<{ user_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT ur.user_id
       FROM core.user_roles ur
       INNER JOIN core.roles r ON r.id = ur.role_id
       INNER JOIN core.role_permissions rp ON rp.role_id = r.id
       INNER JOIN core.permissions p ON p.id = rp.permission_id
       WHERE ur.is_active = true
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
         AND r.is_active = true
         AND (r.organization_id = $1 OR r.organization_id IS NULL)
         AND p.code IN ('hr.leave.approve', 'hr.attendance.manage', 'hr.permissions.manage')`,
      [organizationId],
    );
    return rows.map(r => r.user_id);
  }

  private async resolveAdminName(userId: string | null): Promise<string> {
    if (!userId) return 'L\'administrateur RH';
    try {
      const u = await this.usersRepo.findOne({
        where: { id: userId },
        select: ['firstName', 'lastName'],
      });
      const name = `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
      return name || 'L\'administrateur RH';
    } catch {
      return 'L\'administrateur RH';
    }
  }

  private async notifyDeductionApplied(input: {
    organizationId: string;
    employeeId: string;
    userId: string | null;
    totalDays: number;
    newRemainingDays: number;
    appliedBy: string | null;
  }): Promise<void> {
    try {
      const adminName = await this.resolveAdminName(input.appliedBy);
      // Notification à l'employé
      if (input.userId) {
        await this.inAppNotificationService.create({
          userId: input.userId,
          organizationId: input.organizationId,
          type: 'leave_deduction_applied',
          title: 'Déduction sur votre solde de congés',
          message:
            `${input.totalDays} jour(s) ont été déduits de votre solde de congés par ${adminName}.\n` +
            `Solde restant : ${input.newRemainingDays} jour(s).`,
          data: {
            employeeId: input.employeeId,
            totalDays: input.totalDays,
            newRemainingDays: input.newRemainingDays,
          },
        });
      }

      // Si solde négatif, alerter les admins RH
      if (input.newRemainingDays < 0) {
        const adminIds = await this.findHrAdminUserIds(input.organizationId);
        if (adminIds.length > 0) {
          const employee = await this.employeesRepo.findOne({
            where: { id: input.employeeId },
            relations: ['user'],
          });
          const empName = employee?.user
            ? `${employee.user.firstName ?? ''} ${employee.user.lastName ?? ''}`.trim()
            : 'un employé';

          await this.inAppNotificationService.createMany(
            adminIds.map(uid => ({
              userId: uid,
              organizationId: input.organizationId,
              type: 'leave_balance_negative',
              title: 'Solde de congés négatif',
              message:
                `Le solde de congés de ${empName} est devenu négatif (${input.newRemainingDays} jour(s)) ` +
                `après une déduction de ${input.totalDays} jour(s).`,
              data: {
                employeeId: input.employeeId,
                newRemainingDays: input.newRemainingDays,
                totalDays: input.totalDays,
              },
            })),
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Notification déduction échouée : ${(err as Error).message}`);
    }
  }

  private async notifyDeductionCancelled(input: {
    organizationId: string;
    employeeId: string;
    userId: string | null;
    daysRestored: number;
    newRemainingDays: number;
    appliedBy: string | null;
  }): Promise<void> {
    try {
      if (!input.userId) return;
      const adminName = await this.resolveAdminName(input.appliedBy);
      await this.inAppNotificationService.create({
        userId: input.userId,
        organizationId: input.organizationId,
        type: 'leave_deduction_cancelled',
        title: 'Déduction de congé annulée',
        message:
          `${adminName} a annulé une déduction de ${input.daysRestored} jour(s) sur votre solde.\n` +
          `Solde restant : ${input.newRemainingDays} jour(s).`,
        data: {
          employeeId: input.employeeId,
          daysRestored: input.daysRestored,
          newRemainingDays: input.newRemainingDays,
        },
      });
    } catch (err) {
      this.logger.warn(`Notification annulation déduction échouée : ${(err as Error).message}`);
    }
  }
}
