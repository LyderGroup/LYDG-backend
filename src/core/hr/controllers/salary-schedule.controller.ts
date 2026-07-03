import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsInt, IsString, Min, Max, IsDateString, IsEnum, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { SalaryScheduleService } from '../services/salary-schedule.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';
import type { SalaryFrequency } from '../entities/salary-schedule.entity';

class CreateScheduleDto {
  @IsString() employeeId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(31) payDay!: number;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsEnum(['monthly', 'bi_weekly', 'weekly', 'custom']) frequency?: SalaryFrequency;
  @IsOptional() @Type(() => Number) @IsInt() customInterval?: number;
  @IsOptional() @IsString() notes?: string;
}

class UpdateScheduleDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(31) payDay?: number;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsEnum(['monthly', 'bi_weekly', 'weekly', 'custom']) frequency?: SalaryFrequency;
  @IsOptional() @Type(() => Number) @IsInt() customInterval?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() notes?: string;
}

class MarkPaidDto {
  @IsOptional() @IsString() transactionRef?: string;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/salary-schedules')
export class SalaryScheduleController {
  constructor(private readonly scheduleService: SalaryScheduleService) { }

  // =============================================================================
  // PLANIFICATIONS
  // =============================================================================

  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async createSchedule(@Req() req: any, @Body() dto: CreateScheduleDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;
    const userId = req.user?.id;

    return this.scheduleService.createSchedule(organizationId, userId, {
      employeeId: dto.employeeId,
      payDay: dto.payDay,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      frequency: dto.frequency,
      customInterval: dto.customInterval,
      notes: dto.notes,
    });
  }

  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_READ_ALL, { moduleCode: 'module_c_rh' })
  async listSchedules(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.scheduleService.listSchedules(organizationId);
  }

  @Get('employee/:employeeId')
  @RequirePermission([HR_PERMISSIONS.HR_SALARY_READ_OWN, HR_PERMISSIONS.HR_SALARY_READ_ALL], { moduleCode: 'module_c_rh' })
  async getEmployeeSchedule(@Req() req: any, @Param('employeeId') employeeId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;
    const currentEmployeeId = req.user?.employeeId;
    const hasAllPermission = req.permissionCodes?.includes(HR_PERMISSIONS.HR_SALARY_READ_ALL);

    if (!hasAllPermission && employeeId !== currentEmployeeId) {
      throw new ForbiddenException('Accès non autorisé : vous ne pouvez voir que vos propres données salariales');
    }

    return this.scheduleService.getEmployeeSchedule(employeeId, organizationId);
  }

  @Patch(':id')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async updateSchedule(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.scheduleService.updateSchedule(id, organizationId, {
      payDay: dto.payDay,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      frequency: dto.frequency,
      customInterval: dto.customInterval,
      isActive: dto.isActive,
      notes: dto.notes,
    });
  }

  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async deleteSchedule(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.scheduleService.deleteSchedule(id, organizationId);
  }

  // =============================================================================
  // CALENDRIER
  // =============================================================================

  @Get('calendar/:year/:month')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_READ_ALL, { moduleCode: 'module_c_rh' })
  async getCalendarEvents(
    @Req() req: any,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.scheduleService.getCalendarEvents(organizationId, year, month);
  }

  // =============================================================================
  // PAIEMENTS
  // =============================================================================

  @Post('generate/:year/:month')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async generateMonthlyPayments(
    @Req() req: any,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.scheduleService.generateMonthlyPayments(organizationId, year, month);
  }

  @Get('payments')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_READ_ALL, { moduleCode: 'module_c_rh' })
  async listPayments(
    @Req() req: any,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.scheduleService.listPayments(organizationId, {
      employeeId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('payments/:paymentId/pay')
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async markPaymentPaid(
    @Req() req: any,
    @Param('paymentId') paymentId: string,
    @Body() dto: MarkPaidDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;
    const userId = req.user?.id;

    return this.scheduleService.markPaymentPaid(
      paymentId,
      organizationId,
      userId,
      dto.transactionRef,
    );
  }
}
