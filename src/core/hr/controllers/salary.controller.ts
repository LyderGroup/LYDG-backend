import {
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
  ForbiddenException,
} from '@nestjs/common';
import { IsOptional, IsString, IsNumber, IsDateString, IsBoolean, IsEnum, IsArray, IsInt, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { SalaryService, SalaryFilters } from '../services/salary.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';
import type { SalaryChangeType } from '../entities/employee-salary-history.entity';

// DTOs pour la création et mise à jour des salaires
class CreateSalaryHistoryDto {
  @IsString() employeeId!: string;
  @IsNumber() baseSalary!: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() components?: Array<{ componentId: string; amount: number }>;
  @IsOptional() @IsNumber() totalFixed?: number | null;
  @IsOptional() @IsNumber() maxPerformanceBonus?: number | null;
  @IsDateString() validFrom!: string;
  @IsOptional() @IsDateString() validTo?: string | null;
  @IsOptional() @IsEnum(['HIRED', 'RAISE', 'PROMOTION', 'ADJUSTMENT', 'DECREASE']) changeType?: SalaryChangeType | null;
  @IsOptional() @IsString() changeReason?: string | null;
}

class UpdateSalaryHistoryDto {
  @IsOptional() @IsNumber() baseSalary?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() components?: Array<{ componentId: string; amount: number }>;
  @IsOptional() @IsNumber() totalFixed?: number | null;
  @IsOptional() @IsNumber() maxPerformanceBonus?: number | null;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string | null;
  @IsOptional() @IsString() changeReason?: string | null;
}

class CreateSalaryComponentDto {
  @IsString() positionId!: string;
  @IsEnum(['BASE', 'DISPLACEMENT', 'CONNECTION', 'TERRAIN', 'SENIORITY', 'RETENTION', 'PERFORMANCE', 'FORMATION', 'CERTIFICATION', 'TERRAIN_BONUS', 'OTHER']) componentType!: string;
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsObject() conditions?: Record<string, any>;
  @IsOptional() @IsEnum(['fixed', 'per_day', 'per_unit', 'percentage']) calculationType?: string;
  @IsOptional() @IsString() calculationBase?: string;
  @IsOptional() @IsInt() displayOrder?: number;
}

class UpdateSalaryComponentDto {
  @IsOptional() @IsEnum(['BASE', 'DISPLACEMENT', 'CONNECTION', 'TERRAIN', 'SENIORITY', 'RETENTION', 'PERFORMANCE', 'FORMATION', 'CERTIFICATION', 'TERRAIN_BONUS', 'OTHER']) componentType?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsObject() conditions?: Record<string, any>;
  @IsOptional() @IsEnum(['fixed', 'per_day', 'per_unit', 'percentage']) calculationType?: string;
  @IsOptional() @IsString() calculationBase?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() displayOrder?: number;
}

class SalaryFilterDto {
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
  @IsOptional() @IsEnum(['HIRED', 'RAISE', 'PROMOTION', 'ADJUSTMENT', 'DECREASE']) changeType?: SalaryChangeType;
  @IsOptional() @Type(() => Number) @IsInt() page?: number;
  @IsOptional() @Type(() => Number) @IsInt() limit?: number;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/salaries')
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) { }

  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_READ_ALL, { moduleCode: 'module_c_rh' })
  async listSalaries(@Req() req: any, @Query() filters: SalaryFilterDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.salaryService.listSalaries(organizationId, {
      employeeId: filters.employeeId,
      departmentId: filters.departmentId,
      validFrom: filters.validFrom ? new Date(filters.validFrom) : undefined,
      validTo: filters.validTo ? new Date(filters.validTo) : undefined,
      changeType: filters.changeType,
      page: filters.page,
      limit: filters.limit,
    });
  }

  @Get('stats')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_READ_ALL, { moduleCode: 'module_c_rh' })
  async getSalaryStats(@Req() req: any, @Query('departmentId') departmentId?: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.salaryService.getSalaryStats(organizationId, departmentId);
  }

  @Get('employee/:employeeId/current')
  @RequirePermission([HR_PERMISSIONS.HR_SALARY_READ_OWN, HR_PERMISSIONS.HR_SALARY_READ_ALL], { moduleCode: 'module_c_rh' })
  async getCurrentSalary(@Req() req: any, @Param('employeeId') employeeId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;
    const currentEmployeeId = req.user?.employeeId;
    const hasAllPermission = req.permissionCodes?.includes(HR_PERMISSIONS.HR_SALARY_READ_ALL);

    if (!hasAllPermission && employeeId !== currentEmployeeId) {
      throw new ForbiddenException('Accès non autorisé : vous ne pouvez voir que vos propres données salariales');
    }

    return this.salaryService.getCurrentSalary(employeeId, organizationId);
  }

  @Get('employee/:employeeId/history')
  @RequirePermission([HR_PERMISSIONS.HR_SALARY_READ_OWN, HR_PERMISSIONS.HR_SALARY_READ_ALL], { moduleCode: 'module_c_rh' })
  async getEmployeeSalaryHistory(@Req() req: any, @Param('employeeId') employeeId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;
    const currentEmployeeId = req.user?.employeeId;
    const hasAllPermission = req.permissionCodes?.includes(HR_PERMISSIONS.HR_SALARY_READ_ALL);

    if (!hasAllPermission && employeeId !== currentEmployeeId) {
      throw new ForbiddenException('Accès non autorisé : vous ne pouvez voir que vos propres données salariales');
    }

    return this.salaryService.getEmployeeSalaryHistory(employeeId, organizationId);
  }

  /**
   * Créer une nouvelle entrée dans l'historique des salaires (changement de salaire)
   * Permission: HR_SALARY_WRITE_ALL ou HR_SALARY_WRITE_TEAM
   */
  @Post('employee/:employeeId/history')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async createSalaryHistory(
    @Req() req: any,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateSalaryHistoryDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;
    const userId = req.user?.id;

    return this.salaryService.createSalaryHistory(employeeId, organizationId, userId, {
      employeeId: dto.employeeId,
      baseSalary: dto.baseSalary,
      currency: dto.currency,
      components: dto.components,
      totalFixed: dto.totalFixed,
      maxPerformanceBonus: dto.maxPerformanceBonus,
      validFrom: new Date(dto.validFrom),
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      changeType: dto.changeType,
      changeReason: dto.changeReason,
    });
  }

  /**
   * Mettre à jour une entrée de l'historique
   * Permission: HR_SALARY_WRITE_ALL
   */
  @Patch('history/:id')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async updateSalaryHistory(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSalaryHistoryDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.salaryService.updateSalaryHistory(id, organizationId, {
      baseSalary: dto.baseSalary,
      currency: dto.currency,
      components: dto.components,
      totalFixed: dto.totalFixed,
      maxPerformanceBonus: dto.maxPerformanceBonus,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
      validTo: dto.validTo ? new Date(dto.validTo) : undefined,
      changeReason: dto.changeReason,
    });
  }

  /**
   * Supprimer une entrée de l'historique (soft delete)
   * Permission: HR_SALARY_WRITE_ALL
   */
  @Delete('history/:id')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async deleteSalaryHistory(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.salaryService.deleteSalaryHistory(id, organizationId);
  }

  // =============================================================================
  // COMPOSANTS SALARIAUX
  // =============================================================================

  /**
   * Lister les composants salariaux de l'organisation
   * Permission: HR_SALARY_READ_ALL
   */
  @Get('components')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_READ_ALL, { moduleCode: 'module_c_rh' })
  async getSalaryComponents(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.salaryService.getSalaryComponents(organizationId);
  }

  /**
   * Créer un composant salarial
   * Permission: HR_SALARY_WRITE_ALL
   */
  @Post('components')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async createSalaryComponent(@Req() req: any, @Body() dto: CreateSalaryComponentDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.salaryService.createSalaryComponent(organizationId, {
      positionId: dto.positionId,
      componentType: dto.componentType,
      name: dto.name,
      code: dto.code,
      description: dto.description,
      amount: dto.amount,
      currency: dto.currency,
      conditions: dto.conditions,
      calculationType: dto.calculationType,
      calculationBase: dto.calculationBase,
      displayOrder: dto.displayOrder,
    });
  }

  /**
   * Mettre à jour un composant salarial
   * Permission: HR_SALARY_WRITE_ALL
   */
  @Patch('components/:id')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async updateSalaryComponent(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSalaryComponentDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.salaryService.updateSalaryComponent(id, organizationId, {
      componentType: dto.componentType,
      name: dto.name,
      code: dto.code,
      description: dto.description,
      amount: dto.amount,
      currency: dto.currency,
      conditions: dto.conditions,
      calculationType: dto.calculationType,
      calculationBase: dto.calculationBase,
      isActive: dto.isActive,
      displayOrder: dto.displayOrder,
    });
  }

  /**
   * Supprimer un composant salarial (soft delete)
   * Permission: HR_SALARY_WRITE_ALL
   */
  @Delete('components/:id')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async deleteSalaryComponent(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.salaryService.deleteSalaryComponent(id, organizationId);
  }

  // =============================================================================
  // EXPORT
  // =============================================================================

  /**
   * Exporter les données salariales (CSV/Excel)
   * Permission: HR_SALARY_EXPORT
   */
  @Get('export')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_EXPORT, { moduleCode: 'module_c_rh' })
  async exportSalaries(@Req() req: any, @Query() filters: SalaryFilterDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    // Pour l'instant, retourner les données brutes
    // TODO: Implémenter l'export CSV/Excel
    const salaries = await this.salaryService.listSalaries(organizationId, {
      ...filters,
      validFrom: filters.validFrom ? new Date(filters.validFrom) : undefined,
      validTo: filters.validTo ? new Date(filters.validTo) : undefined,
      limit: 1000, // Limite pour export
    });

    return {
      data: salaries.data,
      format: 'json',
      // Dans une vraie implémentation, on retournerait un fichier CSV/Excel
    };
  }
}
