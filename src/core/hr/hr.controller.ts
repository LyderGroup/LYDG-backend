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
import { HrService } from './hr.service';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';

class CreateEmployeeDto {
  userId?: string | null;
  organizationId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  hrManagerId?: string | null;
  referralEmployeeId?: string | null;
  employeeNumber!: string;
  socialSecurityNumber?: string | null;
  taxId?: string | null;
  jobTitle?: string | null;
  employmentType?: string | null;
  contractType?: string | null;
  contractStartDate!: string;
  contractEndDate?: string | null;
  probationEndDate?: string | null;
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
  hireSource?: string | null;
  badges?: string[];
}

class UpdateEmployeeDto {
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
  contractStartDate?: string;
  contractEndDate?: string | null;
  probationEndDate?: string | null;
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
  terminationDate?: string | null;
  terminationReason?: string | null;
  rehireEligible?: boolean;
  hireSource?: string | null;
  badges?: string[];
}

class BulkEmployeeActionDto {
  action!: 'terminate' | 'restore' | 'activate' | 'suspend';
  ids!: string[];
}

@UseGuards(RolesGuard)
@Controller('core/hr')
export class HrController {
  constructor(private readonly hrService: HrService) { }

  @Get('employees')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;

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

    return this.hrService.findPageForTenant(tenant?.id as string, {
      page,
      limit,
      search,
      departmentId,
      employmentStatus,
      contractType,
    });
  }

  @Get('employees/stats')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async stats(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.hrService.getStatsForTenant(tenant?.id as string);
  }

  @Get('employees/:id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const employee = await this.hrService.findOneForTenant(
      tenant?.id as string,
      id,
    );

    if (!employee) {
      throw new BadRequestException('Employé non trouvé');
    }

    return employee;
  }

  @Post('employees')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async create(@Req() req: any, @Body() dto: CreateEmployeeDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!dto.employeeNumber || !dto.employeeNumber.trim()) {
      throw new BadRequestException('Le numéro d\'employé est obligatoire');
    }
    if (!dto.contractStartDate) {
      throw new BadRequestException('La date de début de contrat est obligatoire');
    }

    return this.hrService.createForTenant(
      tenant?.id as string,
      (currentUser?.id as string) ?? null,
      {
        userId: dto.userId ?? null,
        organizationId: dto.organizationId ?? null,
        departmentId: dto.departmentId ?? null,
        positionId: dto.positionId ?? null,
        managerId: dto.managerId ?? null,
        hrManagerId: dto.hrManagerId ?? null,
        referralEmployeeId: dto.referralEmployeeId ?? null,
        employeeNumber: dto.employeeNumber.trim(),
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    return this.hrService.updateForTenant(
      tenant?.id as string,
      id,
      (currentUser?.id as string) ?? null,
      {
        userId: dto.userId,
        organizationId: dto.organizationId,
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
        contractEndDate: dto.contractEndDate ? new Date(dto.contractEndDate) : undefined,
        probationEndDate: dto.probationEndDate ? new Date(dto.probationEndDate) : undefined,
        noticePeriodDays: dto.noticePeriodDays,
        baseSalary: dto.baseSalary,
        salaryCurrency: dto.salaryCurrency,
        paymentFrequency: dto.paymentFrequency,
        birthPlace: dto.birthPlace,
        maritalStatus: dto.maritalStatus,
        dependentsCount: dto.dependentsCount,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactRelationship: dto.emergencyContactRelationship,
        emergencyContactPhone: dto.emergencyContactPhone,
        emergencyContactEmail: dto.emergencyContactEmail,
        employmentStatus: dto.employmentStatus,
        terminationDate: dto.terminationDate ? new Date(dto.terminationDate) : undefined,
        terminationReason: dto.terminationReason,
        rehireEligible: dto.rehireEligible,
        hireSource: dto.hireSource,
        badges: dto.badges,
      },
    );
  }

  @Delete('employees/:id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async softDelete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    await this.hrService.softDeleteForTenant(
      tenant?.id as string,
      id,
      (currentUser?.id as string) ?? null,
    );

    return { deleted: true };
  }

  @Post('employees/:id/restore')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async restore(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    await this.hrService.restoreForTenant(
      tenant?.id as string,
      id,
      (currentUser?.id as string) ?? null,
    );

    return { restored: true };
  }

  @Delete('employees/:id/hard')
  @Roles('SUPER_ADMIN')
  async hardDelete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;

    await this.hrService.hardDeleteForTenant(tenant?.id as string, id);

    return { hardDeleted: true };
  }

  @Post('employees/bulk')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async bulk(@Req() req: any, @Body() dto: BulkEmployeeActionDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!dto.ids || !Array.isArray(dto.ids) || dto.ids.length === 0) {
      throw new BadRequestException('La liste d\'identifiants est obligatoire');
    }

    if (!dto.action) {
      throw new BadRequestException('L\'action à effectuer est obligatoire');
    }

    return this.hrService.bulkActionForTenant(
      tenant?.id as string,
      (currentUser?.id as string) ?? null,
      dto.action,
      dto.ids,
    );
  }
}
