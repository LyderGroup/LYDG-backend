import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Employee } from './employee.entity';

interface CreateEmployeeInput {
  userId?: string | null;
  organizationId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  hrManagerId?: string | null;
  referralEmployeeId?: string | null;
  employeeNumber: string;
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
}

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
  ) { }

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
    _createdBy: string | null,
    input: CreateEmployeeInput,
  ) {
    const employee = this.employeesRepo.create({
      organizationId,
      userId: input.userId ?? null,
      departmentId: input.departmentId ?? null,
      positionId: input.positionId ?? null,
      managerId: input.managerId ?? null,
      hrManagerId: input.hrManagerId ?? null,
      referralEmployeeId: input.referralEmployeeId ?? null,
      employeeNumber: input.employeeNumber,
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
      badges: input.badges ?? [],
    });

    return this.employeesRepo.save(employee);
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

    if (Object.keys(patch).length === 0) {
      return this.employeesRepo.findOne({
        where: { id, organizationId },
        relations: ['department', 'user', 'manager'],
      });
    }

    await this.employeesRepo.update({ id, organizationId }, patch as any);

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
}
