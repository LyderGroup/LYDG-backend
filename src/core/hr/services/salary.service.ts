import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { EmployeeSalaryHistory, SalaryChangeType } from '../entities/employee-salary-history.entity';
import { SalaryComponent } from '../entities/salary-component.entity';
import { Employee } from '../employee.entity';

export interface CreateSalaryHistoryInput {
  employeeId: string;
  baseSalary: number;
  currency?: string;
  components?: Array<{ componentId: string; amount: number }>;
  totalFixed?: number | null;
  maxPerformanceBonus?: number | null;
  validFrom: Date;
  validTo?: Date | null;
  changeType?: SalaryChangeType | null;
  changeReason?: string | null;
}

export interface UpdateSalaryHistoryInput {
  baseSalary?: number;
  currency?: string;
  components?: Array<{ componentId: string; amount: number }>;
  totalFixed?: number | null;
  maxPerformanceBonus?: number | null;
  validFrom?: Date;
  validTo?: Date | null;
  changeReason?: string | null;
}

export interface SalaryFilters {
  employeeId?: string;
  departmentId?: string;
  validFrom?: Date;
  validTo?: Date;
  changeType?: SalaryChangeType;
  page?: number;
  limit?: number;
}

export interface SalaryStats {
  totalEmployees: number;
  totalPayroll: number;
  averageSalary: number;
  minSalary: number;
  maxSalary: number;
  currency: string;
  byDepartment: Array<{
    departmentId: string;
    departmentName: string;
    employeeCount: number;
    totalPayroll: number;
    averageSalary: number;
  }>;
}

@Injectable()
export class SalaryService {
  constructor(
    @InjectRepository(EmployeeSalaryHistory)
    private readonly salaryHistoryRepo: Repository<EmployeeSalaryHistory>,
    @InjectRepository(SalaryComponent)
    private readonly salaryComponentRepo: Repository<SalaryComponent>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) { }

  /**
   * Récupérer l'historique des salaires d'un employé
   */
  async getEmployeeSalaryHistory(employeeId: string, organizationId: string) {
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId, organizationId },
      relations: ['department', 'user'],
    });

    if (!employee) {
      throw new NotFoundException('Employé non trouvé');
    }

    const history = await this.salaryHistoryRepo.find({
      where: { employeeId, deletedAt: null as any },
      order: { validFrom: 'DESC' },
      relations: ['changer'],
    });

    return {
      employee: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        jobTitle: employee.jobTitle,
        user: employee.user,
        department: employee.department,
      },
      currentSalary: employee.baseSalary,
      currency: employee.salaryCurrency,
      history,
    };
  }

  /**
   * Récupérer le salaire actuel d'un employé
   */
  async getCurrentSalary(employeeId: string, organizationId: string) {
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId, organizationId },
      relations: ['department', 'user'],
    });

    if (!employee) {
      throw new NotFoundException('Employé non trouvé');
    }

    // Récupérer l'historique actif
    const today = new Date();
    const currentHistory = await this.salaryHistoryRepo.findOne({
      where: {
        employeeId,
        validFrom: LessThanOrEqual(today),
        deletedAt: null as any,
      },
      order: { validFrom: 'DESC' },
    });

    return {
      employee: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        jobTitle: employee.jobTitle,
        user: employee.user,
        department: employee.department,
      },
      baseSalary: employee.baseSalary,
      currency: employee.salaryCurrency,
      paymentFrequency: employee.paymentFrequency,
      components: currentHistory?.components || [],
      totalFixed: currentHistory?.totalFixed || employee.baseSalary,
      maxPerformanceBonus: currentHistory?.maxPerformanceBonus,
      validFrom: currentHistory?.validFrom,
    };
  }

  /**
   * Créer une nouvelle entrée dans l'historique des salaires
   */
  async createSalaryHistory(
    employeeId: string,
    organizationId: string,
    changedBy: string,
    input: CreateSalaryHistoryInput,
  ) {
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId, organizationId },
    });

    if (!employee) {
      throw new NotFoundException('Employé non trouvé');
    }

    // Calculer le salaire total fixe si des composants sont fournis
    let totalFixed = input.totalFixed;
    if (!totalFixed && input.components && input.components.length > 0) {
      totalFixed = input.baseSalary + input.components.reduce((sum, c) => sum + c.amount, 0);
    } else if (!totalFixed) {
      totalFixed = input.baseSalary;
    }

    // Clôturer l'ancien historique si existant
    const previousHistory = await this.salaryHistoryRepo.findOne({
      where: {
        employeeId,
        validTo: null as any,
        deletedAt: null as any,
      },
    });

    if (previousHistory) {
      previousHistory.validTo = new Date(input.validFrom.getTime() - 86400000); // Jour précédent
      await this.salaryHistoryRepo.save(previousHistory);
    }

    // Créer le nouvel historique
    const salaryHistory = this.salaryHistoryRepo.create({
      employeeId,
      baseSalary: input.baseSalary,
      currency: input.currency || 'XOF',
      components: input.components || [],
      totalFixed,
      maxPerformanceBonus: input.maxPerformanceBonus || null,
      validFrom: input.validFrom,
      validTo: input.validTo || null,
      previousSalary: employee.baseSalary,
      changeType: input.changeType || 'ADJUSTMENT',
      changeReason: input.changeReason || null,
      changedBy,
    });

    await this.salaryHistoryRepo.save(salaryHistory);

    // Mettre à jour le salaire de base de l'employé
    employee.baseSalary = input.baseSalary;
    if (input.currency) {
      employee.salaryCurrency = input.currency;
    }
    await this.employeeRepo.save(employee);

    return salaryHistory;
  }

  /**
   * Mettre à jour une entrée de l'historique
   */
  async updateSalaryHistory(
    id: string,
    organizationId: string,
    input: UpdateSalaryHistoryInput,
  ) {
    const history = await this.salaryHistoryRepo.findOne({
      where: { id },
      relations: ['employee'],
    });

    if (!history || history.employee.organizationId !== organizationId) {
      throw new NotFoundException('Historique de salaire non trouvé');
    }

    if (input.baseSalary !== undefined) {
      history.baseSalary = input.baseSalary;
    }
    if (input.currency !== undefined) {
      history.currency = input.currency;
    }
    if (input.components !== undefined) {
      history.components = input.components;
    }
    if (input.totalFixed !== undefined) {
      history.totalFixed = input.totalFixed;
    }
    if (input.maxPerformanceBonus !== undefined) {
      history.maxPerformanceBonus = input.maxPerformanceBonus;
    }
    if (input.validFrom !== undefined) {
      history.validFrom = input.validFrom;
    }
    if (input.validTo !== undefined) {
      history.validTo = input.validTo;
    }
    if (input.changeReason !== undefined) {
      history.changeReason = input.changeReason;
    }

    // Recalculer le total fixe si nécessaire
    if (input.components && input.baseSalary !== undefined) {
      history.totalFixed = input.baseSalary + input.components.reduce((sum, c) => sum + c.amount, 0);
    }

    return this.salaryHistoryRepo.save(history);
  }

  /**
   * Supprimer une entrée de l'historique (soft delete)
   */
  async deleteSalaryHistory(id: string, organizationId: string) {
    const history = await this.salaryHistoryRepo.findOne({
      where: { id },
      relations: ['employee'],
    });

    if (!history || history.employee.organizationId !== organizationId) {
      throw new NotFoundException('Historique de salaire non trouvé');
    }

    history.deletedAt = new Date();
    await this.salaryHistoryRepo.save(history);

    return { deleted: true };
  }

  /**
   * Lister les salaires avec filtres
   */
  async listSalaries(organizationId: string, filters: SalaryFilters = {}) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

    // Construire la requête pour les employés actifs avec leur salaire actuel
    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'user')
      .leftJoinAndSelect('e.department', 'department')
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.employmentStatus = :status', { status: 'active' })
      .andWhere('e.baseSalary IS NOT NULL');

    if (filters.departmentId) {
      qb.andWhere('e.departmentId = :deptId', { deptId: filters.departmentId });
    }

    if (filters.employeeId) {
      qb.andWhere('e.id = :empId', { empId: filters.employeeId });
    }

    qb.orderBy('e.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [employees, total] = await qb.getManyAndCount();

    // Enrichir avec l'historique actuel
    const salaries = await Promise.all(
      employees.map(async (emp) => {
        const currentHistory = await this.salaryHistoryRepo.findOne({
          where: {
            employeeId: emp.id,
            validFrom: LessThanOrEqual(new Date()),
            deletedAt: null as any,
          },
          order: { validFrom: 'DESC' },
        });

        return {
          id: emp.id,
          employeeNumber: emp.employeeNumber,
          user: emp.user,
          jobTitle: emp.jobTitle,
          department: emp.department,
          positionId: emp.positionId,
          baseSalary: emp.baseSalary,
          currency: emp.salaryCurrency,
          paymentFrequency: emp.paymentFrequency,
          contractStartDate: emp.contractStartDate,
          contractEndDate: emp.contractEndDate,
          components: currentHistory?.components || [],
          totalFixed: currentHistory?.totalFixed || emp.baseSalary,
          maxPerformanceBonus: currentHistory?.maxPerformanceBonus,
        };
      }),
    );

    return {
      data: salaries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Statistiques salariales
   */
  async getSalaryStats(organizationId: string, departmentId?: string): Promise<SalaryStats> {
    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.department', 'department')
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.employmentStatus = :status', { status: 'active' })
      .andWhere('e.baseSalary IS NOT NULL');

    if (departmentId) {
      qb.andWhere('e.departmentId = :deptId', { deptId: departmentId });
    }

    const employees = await qb.getMany();

    const totalEmployees = employees.length;
    const salaries = employees.map((e) => Number(e.baseSalary) || 0);

    const totalPayroll = salaries.reduce((sum, s) => sum + s, 0);
    const averageSalary = totalEmployees > 0 ? totalPayroll / totalEmployees : 0;
    const minSalary = totalEmployees > 0 ? Math.min(...salaries) : 0;
    const maxSalary = totalEmployees > 0 ? Math.max(...salaries) : 0;

    // Stats par département
    const deptStats = new Map<string, { count: number; total: number; name: string }>();

    for (const emp of employees) {
      const deptId = emp.departmentId || 'no-dept';
      const deptName = emp.department?.name || 'Sans département';

      const existing = deptStats.get(deptId) || { count: 0, total: 0, name: deptName };
      existing.count += 1;
      existing.total += Number(emp.baseSalary) || 0;
      deptStats.set(deptId, existing);
    }

    const byDepartment = Array.from(deptStats.entries()).map(([deptId, stats]) => ({
      departmentId: deptId,
      departmentName: stats.name,
      employeeCount: stats.count,
      totalPayroll: stats.total,
      averageSalary: stats.count > 0 ? stats.total / stats.count : 0,
    }));

    return {
      totalEmployees,
      totalPayroll,
      averageSalary,
      minSalary,
      maxSalary,
      currency: 'XOF',
      byDepartment,
    };
  }

  /**
   * Récupérer les composants salariaux d'une organisation
   */
  async getSalaryComponents(organizationId: string) {
    return this.salaryComponentRepo.find({
      where: { organizationId, deletedAt: null as any },
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
  }

  /**
   * Créer un composant salarial
   */
  async createSalaryComponent(
    organizationId: string,
    input: {
      positionId: string;
      componentType: string;
      name: string;
      code: string;
      description?: string;
      amount: number;
      currency?: string;
      conditions?: Record<string, any>;
      calculationType?: string;
      calculationBase?: string;
      displayOrder?: number;
    },
  ) {
    const component = this.salaryComponentRepo.create({
      organizationId,
      positionId: input.positionId,
      componentType: input.componentType as any,
      name: input.name,
      code: input.code,
      description: input.description || null,
      amount: input.amount,
      currency: input.currency || 'XOF',
      conditions: input.conditions || {},
      calculationType: input.calculationType as any || 'fixed',
      calculationBase: input.calculationBase || null,
      isActive: true,
      displayOrder: input.displayOrder || 0,
    });

    return this.salaryComponentRepo.save(component);
  }

  /**
   * Mettre à jour un composant salarial
   */
  async updateSalaryComponent(
    id: string,
    organizationId: string,
    input: Partial<{
      componentType: string;
      name: string;
      code: string;
      description: string;
      amount: number;
      currency: string;
      conditions: Record<string, any>;
      calculationType: string;
      calculationBase: string;
      isActive: boolean;
      displayOrder: number;
    }>,
  ) {
    const component = await this.salaryComponentRepo.findOne({
      where: { id, organizationId },
    });

    if (!component) {
      throw new NotFoundException('Composant salarial non trouvé');
    }

    Object.assign(component, input);
    return this.salaryComponentRepo.save(component);
  }

  /**
   * Supprimer un composant salarial (soft delete)
   */
  async deleteSalaryComponent(id: string, organizationId: string) {
    const component = await this.salaryComponentRepo.findOne({
      where: { id, organizationId },
    });

    if (!component) {
      throw new NotFoundException('Composant salarial non trouvé');
    }

    component.deletedAt = new Date();
    await this.salaryComponentRepo.save(component);

    return { deleted: true };
  }
}
