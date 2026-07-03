import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, IsNumber, IsBoolean, IsDateString, IsArray, IsEnum, IsInt, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { HrService } from './hr.service';
import { OvertimeService } from './services/overtime.service';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from './hr.permissions';

class CreateEmployeeDto {
  @IsString() userId!: string;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() positionId?: string | null;
  @IsOptional() @IsString() managerId?: string | null;
  @IsOptional() @IsString() hrManagerId?: string | null;
  @IsOptional() @IsString() referralEmployeeId?: string | null;
  @IsOptional() @IsString() employeeNumber?: string;
  @IsOptional() @IsString() socialSecurityNumber?: string | null;
  @IsOptional() @IsString() taxId?: string | null;
  @IsOptional() @IsString() jobTitle?: string | null;
  @IsOptional() @IsString() employmentType?: string | null;
  @IsOptional() @IsString() contractType?: string | null;
  @IsDateString() contractStartDate!: string;
  @IsOptional() @IsDateString() contractEndDate?: string | null;
  @IsOptional() @IsDateString() probationEndDate?: string | null;
  @IsOptional() @IsInt() noticePeriodDays?: number;
  @IsOptional() @IsNumber() baseSalary?: number | null;
  @IsOptional() @IsString() salaryCurrency?: string;
  @IsOptional() @IsString() paymentFrequency?: string;
  @IsOptional() @IsString() birthPlace?: string | null;
  @IsOptional() @IsDateString() birthDate?: string | null;
  @IsOptional() @IsString() maritalStatus?: string | null;
  @IsOptional() @IsInt() dependentsCount?: number;
  @IsOptional() @IsString() emergencyContactName?: string | null;
  @IsOptional() @IsString() emergencyContactRelationship?: string | null;
  @IsOptional() @IsString() emergencyContactPhone?: string | null;
  @IsOptional() @IsString() emergencyContactEmail?: string | null;
  @IsOptional() @IsString() employmentStatus?: string;
  @IsOptional() @IsString() hireSource?: string | null;
  @IsOptional() @IsArray() badges?: string[];
  @IsOptional() @IsString() workStartTime?: string | null;
  @IsOptional() @IsString() workEndTime?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) workDays?: string[];
  @IsOptional() @IsNumber() annualLeaveDays?: number | null;
}

class UpdateEmployeeDto {
  @IsOptional() @IsString() userId?: string | null;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() positionId?: string | null;
  @IsOptional() @IsString() managerId?: string | null;
  @IsOptional() @IsString() hrManagerId?: string | null;
  @IsOptional() @IsString() referralEmployeeId?: string | null;
  @IsOptional() @IsString() employeeNumber?: string;
  @IsOptional() @IsString() socialSecurityNumber?: string | null;
  @IsOptional() @IsString() taxId?: string | null;
  @IsOptional() @IsString() jobTitle?: string | null;
  @IsOptional() @IsString() employmentType?: string | null;
  @IsOptional() @IsString() contractType?: string | null;
  @IsOptional() @IsDateString() contractStartDate?: string;
  @IsOptional() @IsDateString() contractEndDate?: string | null;
  @IsOptional() @IsDateString() probationEndDate?: string | null;
  @IsOptional() @IsInt() noticePeriodDays?: number;
  @IsOptional() @IsNumber() baseSalary?: number | null;
  @IsOptional() @IsString() salaryCurrency?: string;
  @IsOptional() @IsString() paymentFrequency?: string;
  @IsOptional() @IsString() birthPlace?: string | null;
  @IsOptional() @IsDateString() birthDate?: string | null;
  @IsOptional() @IsString() maritalStatus?: string | null;
  @IsOptional() @IsInt() dependentsCount?: number;
  @IsOptional() @IsString() emergencyContactName?: string | null;
  @IsOptional() @IsString() emergencyContactRelationship?: string | null;
  @IsOptional() @IsString() emergencyContactPhone?: string | null;
  @IsOptional() @IsString() emergencyContactEmail?: string | null;
  @IsOptional() @IsString() employmentStatus?: string;
  @IsOptional() @IsDateString() terminationDate?: string | null;
  @IsOptional() @IsString() terminationReason?: string | null;
  @IsOptional() @IsBoolean() rehireEligible?: boolean;
  @IsOptional() @IsString() hireSource?: string | null;
  @IsOptional() @IsArray() badges?: string[];
  @IsOptional() @IsString() workStartTime?: string | null;
  @IsOptional() @IsString() workEndTime?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) workDays?: string[];
  @IsOptional() @IsNumber() annualLeaveDays?: number | null;
}

class BulkEmployeeActionDto {
  @IsEnum(['terminate', 'restore', 'activate', 'suspend'])
  action!: 'terminate' | 'restore' | 'activate' | 'suspend';
  @IsArray() @IsString({ each: true }) ids!: string[];
}

class UpdateEmployeeScheduleDto {
  @IsOptional() @IsString() workStartTime?: string | null;
  @IsOptional() @IsString() workEndTime?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) workDays?: string[];
  @IsOptional() @IsNumber() annualLeaveDays?: number | null;
}

// DTOs déclarés AVANT la classe contrôleur : ils sont référencés dans des
// décorateurs `@Body() dto: XYZ` qui sont évalués à l'enregistrement de la
// classe (avant l'exécution du body du fichier). Les déclarer après
// provoque un ReferenceError TDZ au runtime — l'appli ne démarre pas.
class LeaveDeductionRecordDto {
  @IsString() id!: string;
  @IsIn(['attendance', 'leave_request'])
  type!: 'attendance' | 'leave_request';
}

class ApplyLeaveDeductionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveDeductionRecordDto)
  records!: LeaveDeductionRecordDto[];
}

class CancelLeaveDeductionDto {
  @IsString() recordId!: string;
  @IsIn(['attendance', 'leave_request'])
  recordType!: 'attendance' | 'leave_request';
  @IsString() @IsOptional() comment?: string;
}

@UseGuards(PermissionGuard)
@Controller('core/hr')
export class HrController {
  constructor(
    private readonly hrService: HrService,
    private readonly overtimeService: OvertimeService,
  ) { }

  @Get('employees/stats')
  @RequirePermission([HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, HR_PERMISSIONS.HR_EMPLOYEES_READ_TEAM], { moduleCode: 'module_c_rh' })
  async stats(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');
    return this.hrService.getStatsForTenant(orgId);
  }

  @Get('employees')
  @RequirePermission([HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, HR_PERMISSIONS.HR_EMPLOYEES_READ_TEAM], { moduleCode: 'module_c_rh' })
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    const page = query.page ? parseInt(query.page as string, 10) : undefined;
    const limit = query.limit
      ? parseInt(query.limit as string, 10)
      : undefined;
    const search =
      typeof query.search === 'string' && query.search.trim().length > 0
        ? query.search.trim()
        : undefined;
    const departmentId =
      typeof query.departmentId === 'string' ? query.departmentId : undefined;
    const employmentStatus =
      typeof query.employmentStatus === 'string' ? query.employmentStatus : undefined;
    const contractType =
      typeof query.contractType === 'string' ? query.contractType : undefined;

    return this.hrService.findPageForTenant(orgId, {
      page,
      limit,
      search,
      departmentId,
      employmentStatus,
      contractType,
    });
  }

  @Get('users-without-employee')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE, { moduleCode: 'module_c_rh' })
  async listUsersWithoutEmployee(@Req() req: any, @Query('search') search?: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');
    const users = await this.hrService.findUsersWithoutEmployee(orgId, search);
    return { data: users };
  }

  @Post('employees/link-users')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE, { moduleCode: 'module_c_rh' })
  async linkEmployeesToUsers(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');
    const result = await this.hrService.linkEmployeesToUsersByEmail(orgId);
    return result;
  }

  @Get('next-employee-number')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE, { moduleCode: 'module_c_rh' })
  async getNextEmployeeNumber(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');
    const employeeNumber = await this.hrService.getNextEmployeeNumber(orgId);
    return { employeeNumber };
  }

  @Get('employees/:id')
  @RequirePermission([HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, HR_PERMISSIONS.HR_EMPLOYEES_READ_OWN], { moduleCode: 'module_c_rh' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');
    const employee = await this.hrService.findOneForTenant(orgId, id);

    if (!employee) {
      throw new BadRequestException('Employé non trouvé');
    }

    return employee;
  }

  @Post('employees')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE, { moduleCode: 'module_c_rh' })
  async create(@Req() req: any, @Body() dto: CreateEmployeeDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    if (!dto.contractStartDate) {
      throw new BadRequestException('La date de début de contrat est obligatoire');
    }

    if (!dto.userId) {
      throw new BadRequestException('userId est obligatoire');
    }

    return this.hrService.createForTenant(
      orgId,
      (currentUser?.id as string) ?? null,
      {
        userId: dto.userId,
        organizationId: orgId,
        departmentId: dto.departmentId ?? null,
        positionId: dto.positionId ?? null,
        managerId: dto.managerId ?? null,
        hrManagerId: dto.hrManagerId ?? null,
        referralEmployeeId: dto.referralEmployeeId ?? null,
        employeeNumber: dto.employeeNumber?.trim() || null,
        socialSecurityNumber: dto.socialSecurityNumber ?? null,
        taxId: dto.taxId ?? null,
        jobTitle: dto.jobTitle ?? null,
        employmentType: dto.employmentType ?? null,
        contractType: dto.contractType ?? null,
        contractStartDate: new Date(dto.contractStartDate),
        contractEndDate: dto.contractEndDate ? new Date(dto.contractEndDate) : null,
        probationEndDate: dto.probationEndDate ? new Date(dto.probationEndDate) : null,
        noticePeriodDays: dto.noticePeriodDays ?? 30,
        baseSalary: dto.baseSalary ?? null,
        salaryCurrency: dto.salaryCurrency ?? 'XOF',
        paymentFrequency: dto.paymentFrequency ?? 'monthly',
        birthPlace: dto.birthPlace ?? null,
        maritalStatus: dto.maritalStatus ?? null,
        dependentsCount: dto.dependentsCount ?? 0,
        emergencyContactName: dto.emergencyContactName ?? null,
        emergencyContactRelationship: dto.emergencyContactRelationship ?? null,
        emergencyContactPhone: dto.emergencyContactPhone ?? null,
        emergencyContactEmail: dto.emergencyContactEmail ?? null,
        employmentStatus: dto.employmentStatus ?? 'active',
        hireSource: dto.hireSource ?? null,
        badges: dto.badges ?? [],
      },
    );
  }

  @Patch('employees/:id')
  @RequirePermission([HR_PERMISSIONS.HR_EMPLOYEES_WRITE_ALL, HR_PERMISSIONS.HR_EMPLOYEES_WRITE_OWN], { moduleCode: 'module_c_rh' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    return this.hrService.updateForTenant(
      orgId,
      id,
      (currentUser?.id as string) ?? null,
      {
        userId: dto.userId,
        departmentId: dto.departmentId,
        positionId: dto.positionId,
        managerId: dto.managerId,
        hrManagerId: dto.hrManagerId,
        referralEmployeeId: dto.referralEmployeeId,
        employeeNumber: dto.employeeNumber,
        socialSecurityNumber: dto.socialSecurityNumber,
        taxId: dto.taxId,
        jobTitle: dto.jobTitle,
        employmentType: dto.employmentType,
        contractType: dto.contractType,
        contractStartDate: dto.contractStartDate ? new Date(dto.contractStartDate) : undefined,
        contractEndDate: dto.contractEndDate === undefined ? undefined : dto.contractEndDate === null ? null : new Date(dto.contractEndDate),
        probationEndDate: dto.probationEndDate === undefined ? undefined : dto.probationEndDate === null ? null : new Date(dto.probationEndDate),
        noticePeriodDays: dto.noticePeriodDays,
        baseSalary: dto.baseSalary,
        salaryCurrency: dto.salaryCurrency,
        paymentFrequency: dto.paymentFrequency,
        birthPlace: dto.birthPlace,
        birthDate: dto.birthDate,
        maritalStatus: dto.maritalStatus,
        dependentsCount: dto.dependentsCount,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactRelationship: dto.emergencyContactRelationship,
        emergencyContactPhone: dto.emergencyContactPhone,
        emergencyContactEmail: dto.emergencyContactEmail,
        employmentStatus: dto.employmentStatus,
        terminationDate: dto.terminationDate === undefined ? undefined : dto.terminationDate === null ? null : new Date(dto.terminationDate),
        terminationReason: dto.terminationReason,
        rehireEligible: dto.rehireEligible,
        hireSource: dto.hireSource,
        badges: dto.badges,
        workStartTime: dto.workStartTime,
        workEndTime: dto.workEndTime,
        workDays: dto.workDays,
        annualLeaveDays: dto.annualLeaveDays,
      },
    );
  }

  @Delete('employees/:id')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_DELETE, { moduleCode: 'module_c_rh' })
  async softDelete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    const employee = await this.hrService.findOneForTenant(orgId, id);
    if (!employee) throw new BadRequestException('Employé non trouvé');

    await this.hrService.softDeleteForTenant(
      orgId,
      id,
      (currentUser?.id as string) ?? null,
    );

    return { deleted: true };
  }

  @Post('employees/:id/restore')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_RESTORE, { moduleCode: 'module_c_rh' })
  async restore(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    await this.hrService.restoreForTenant(
      orgId,
      id,
      (currentUser?.id as string) ?? null,
    );

    return { restored: true };
  }

  @Delete('employees/:id/hard')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_DELETE, { moduleCode: 'module_c_rh' })
  async hardDelete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    await this.hrService.hardDeleteForTenant(orgId, id);

    return { hardDeleted: true };
  }

  @Post('employees/bulk')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE, { moduleCode: 'module_c_rh' })
  async bulk(@Req() req: any, @Body() dto: BulkEmployeeActionDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    if (!dto.ids || !Array.isArray(dto.ids) || dto.ids.length === 0) {
      throw new BadRequestException('La liste d\'identifiants est obligatoire');
    }

    if (!dto.action) {
      throw new BadRequestException('L\'action à effectuer est obligatoire');
    }

    return this.hrService.bulkActionForTenant(
      orgId,
      (currentUser?.id as string) ?? null,
      dto.action,
      dto.ids,
    );
  }

  @Get('employees/me')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_OWN, { moduleCode: 'module_c_rh' })
  async getMyEmployeeProfile(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { employeeId?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');
    if (!currentUser?.employeeId) throw new BadRequestException('Employé non trouvé pour cet utilisateur');

    return this.hrService.findOneForTenant(orgId, currentUser.employeeId);
  }

  @Patch('employees/me/profile')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE_OWN, { moduleCode: 'module_c_rh' })
  async updateMyEmployeeProfile(
    @Req() req: any,
    @Body() dto: UpdateEmployeeDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { employeeId?: string; id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');
    if (!currentUser?.employeeId) throw new BadRequestException('Employé non trouvé pour cet utilisateur');

    return this.hrService.updateForTenant(
      orgId,
      currentUser.employeeId,
      (currentUser?.id as string) ?? null,
      {
        birthPlace: dto.birthPlace,
        birthDate: dto.birthDate,
        maritalStatus: dto.maritalStatus,
        dependentsCount: dto.dependentsCount,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactRelationship: dto.emergencyContactRelationship,
        emergencyContactPhone: dto.emergencyContactPhone,
        emergencyContactEmail: dto.emergencyContactEmail,
      },
    );
  }

  @Patch('employees/:id/schedule')
  @RequirePermission([HR_PERMISSIONS.HR_EMPLOYEES_WRITE_ALL, HR_PERMISSIONS.HR_EMPLOYEES_WRITE_OWN], { moduleCode: 'module_c_rh' })
  async updateSchedule(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeScheduleDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    return this.hrService.updateScheduleForTenant(
      orgId,
      id,
      {
        workStartTime: dto.workStartTime ?? null,
        workEndTime: dto.workEndTime ?? null,
        workDays: dto.workDays ?? undefined,
        annualLeaveDays: dto.annualLeaveDays ?? null,
      },
    );
  }

  @Get('employees/:id/leave-usage')
  @RequirePermission([HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, HR_PERMISSIONS.HR_LEAVE_READ_OWN, HR_PERMISSIONS.HR_LEAVE_READ_ALL], { moduleCode: 'module_c_rh' })
  async getLeaveUsage(
    @Req() req: any,
    @Param('id') id: string,
    @Query('year') year?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    return this.hrService.getLeaveUsage(
      orgId,
      id,
      year ? parseInt(year) : undefined,
    );
  }

  /**
   * Marque une liste d'enregistrements (absences/retards/départs anticipés
   * et/ou demandes de congés approuvées) comme "déduits du solde de congés".
   * Le calcul de getLeaveUsage continue de comptabiliser ces heures dans
   * usedDays — ce flag sert à la traçabilité (audit RH) et permet à l'UI
   * de masquer la checkbox des records déjà appliqués.
   */
  @Post('employees/:id/apply-leave-deduction')
  @RequirePermission([HR_PERMISSIONS.HR_LEAVE_APPROVE, HR_PERMISSIONS.HR_ATTENDANCE_MANAGE], { moduleCode: 'module_c_rh' })
  async applyLeaveDeduction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ApplyLeaveDeductionDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');
    if (!dto.records || dto.records.length === 0) {
      throw new BadRequestException('Aucun enregistrement sélectionné');
    }
    const userId = (req.user?.id as string | undefined) ?? null;
    return this.hrService.applyLeaveDeduction(orgId, id, userId, dto.records);
  }

  /**
   * Historique des déductions de congé pour un employé. Inclut les
   * applications ET les annulations (lignes négatives, isCancellation=true).
   */
  @Get('employees/:id/leave-deduction-history')
  @RequirePermission(
    [
      HR_PERMISSIONS.HR_LEAVE_APPROVE,
      HR_PERMISSIONS.HR_ATTENDANCE_MANAGE,
      HR_PERMISSIONS.HR_LEAVE_READ_ALL,
    ],
    { moduleCode: 'module_c_rh' },
  )
  async getLeaveDeductionHistory(
    @Req() req: any,
    @Param('id') id: string,
    @Query('year') year?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');
    return this.hrService.getLeaveDeductionHistory(
      orgId,
      id,
      year ? parseInt(year) : undefined,
    );
  }

  /**
   * Annule une déduction précédemment appliquée (réactive le crédit de l'employé).
   * Insère une ligne négative dans l'historique pour traçabilité.
   */
  @Post('employees/:id/cancel-leave-deduction')
  @RequirePermission(
    [HR_PERMISSIONS.HR_LEAVE_APPROVE, HR_PERMISSIONS.HR_ATTENDANCE_MANAGE],
    { moduleCode: 'module_c_rh' },
  )
  async cancelLeaveDeduction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CancelLeaveDeductionDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');
    const userId = (req.user?.id as string | undefined) ?? null;
    return this.hrService.cancelLeaveDeduction(orgId, id, userId, {
      recordId: dto.recordId,
      recordType: dto.recordType,
      comment: dto.comment ?? null,
    });
  }

  @Get('employees/:id/overtime')
  @RequirePermission(
    [
      HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL,
      HR_PERMISSIONS.HR_ATTENDANCE_MANAGE,
      HR_PERMISSIONS.HR_ATTENDANCE_READ_ALL,
      HR_PERMISSIONS.HR_ATTENDANCE_READ_TEAM,
      HR_PERMISSIONS.HR_ATTENDANCE_READ_OWN,
    ],
    { moduleCode: 'module_c_rh' },
  )
  async getEmployeeOvertime(
    @Req() req: any,
    @Param('id') id: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    const now = new Date();
    const targetMonth = month ? parseInt(month, 10) : now.getMonth() + 1;
    const targetYear = year ? parseInt(year, 10) : now.getFullYear();

    if (targetMonth < 1 || targetMonth > 12) {
      throw new BadRequestException('Mois invalide (1-12)');
    }

    return this.overtimeService.getOvertimeForEmployee(orgId, id, targetMonth, targetYear);
  }

  @Get('overtime/summary')
  @RequirePermission(
    [
      HR_PERMISSIONS.HR_ATTENDANCE_MANAGE,
      HR_PERMISSIONS.HR_ATTENDANCE_READ_ALL,
      HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL,
    ],
    { moduleCode: 'module_c_rh' },
  )
  async getOvertimeSummary(
    @Req() req: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const orgId = tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    const now = new Date();
    const targetMonth = month ? parseInt(month, 10) : now.getMonth() + 1;
    const targetYear = year ? parseInt(year, 10) : now.getFullYear();

    if (targetMonth < 1 || targetMonth > 12) {
      throw new BadRequestException('Mois invalide (1-12)');
    }

    return this.overtimeService.getOvertimeSummary(orgId, targetMonth, targetYear);
  }
}
