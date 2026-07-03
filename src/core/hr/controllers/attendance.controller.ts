import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { AttendanceService } from '../services/attendance.service';
import { AttendanceReminderService } from '../services/attendance-reminder.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

@Controller('core/hr/attendance')
@UseGuards(PermissionGuard)
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly attendanceReminderService: AttendanceReminderService,
  ) { }
  @Post('debug/run-reminders')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_MANAGE, { moduleCode: 'module_c_rh' })
  async debugRunReminders(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    const result = await this.attendanceReminderService.runAllTicksForOrg(organizationId);
    return { triggeredAt: new Date().toISOString(), ...result };
  }


  @Post('check-in')
  async checkIn(
    @Req() req: any,
    @Body() body: {
      scheduledCheckIn?: string;
      scheduledCheckOut?: string;
      scheduledHours?: number;
    },
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé - Veuillez avoir un profil employé actif');
    }

    return this.attendanceService.checkIn(organizationId, {
      employeeId,
      ...body,
    });
  }

  @Post('check-out')
  async checkOut(
    @Body() body: { attendanceId: string },
  ) {
    return this.attendanceService.checkOut(body);
  }

  /**
   * BIS-2 : complète a posteriori un pointage de départ manquant
   * (l'employé a oublié de pointer son départ et le déclare le lendemain).
   * Marque is_estimated_checkout = true pour traçabilité RH.
   */
  @Post(':id/complete-checkout')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_WRITE, { moduleCode: 'module_c_rh' })
  async completeCheckout(
    @Req() req: any,
    @Param('id') attendanceId: string,
    @Body() body: { estimatedCheckOut: string; notes?: string },
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      throw new ForbiddenException('Profil employé requis');
    }
    return this.attendanceService.completeCheckout(employeeId, organizationId, {
      attendanceId,
      estimatedCheckOut: body.estimatedCheckOut,
      notes: body.notes ?? null,
    });
  }

  /**
   * BIS-2 : liste les jours incomplets de l'employé courant sur les
   * derniers `days` jours (défaut 7). Pour chaque jour, indique ce qui
   * manque (checkout, journal, gardien) — l'UI peut afficher un panneau
   * de complétion par jour.
   */
  @Get('incomplete')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_OWN, { moduleCode: 'module_c_rh' })
  async getIncomplete(
    @Req() req: any,
    @Query('days') daysQuery?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    const employeeId = req.user.employeeId;
    console.log('[AttendanceController] getIncomplete - employeeId:', employeeId, 'orgId:', organizationId);
    if (!employeeId) {
      throw new ForbiddenException('Profil employé requis');
    }
    const days = daysQuery ? Math.max(1, Math.min(parseInt(daysQuery, 10) || 7, 30)) : 7;
    const result = await this.attendanceService.getIncompleteForEmployee(
      organizationId,
      employeeId,
      days,
    );
    console.log('[AttendanceController] getIncomplete - result count:', result.length, result);
    return result;
  }


  @Post('admin/check-in')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_MANAGE, { moduleCode: 'module_c_rh' })
  async adminCheckIn(
    @Req() req: any,
    @Body() body: {
      employeeId: string;
      scheduledCheckIn?: string;
      scheduledCheckOut?: string;
      scheduledHours?: number;
    },
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;

    return this.attendanceService.checkIn(organizationId, body);
  }

  @Post('admin/check-out')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_MANAGE, { moduleCode: 'module_c_rh' })
  async adminCheckOut(
    @Body() body: { attendanceId: string },
  ) {
    return this.attendanceService.checkOut(body);
  }

  @Post('admin/manual-entry')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_MANAGE, { moduleCode: 'module_c_rh' })
  async adminManualEntry(
    @Req() req: any,
    @Body() body: {
      employeeId: string;
      date: string;
      checkIn: string;
      checkOut?: string;
      notes?: string;
    },
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;

    return this.attendanceService.createManualEntry(organizationId, body);
  }

  @Get('today')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_OWN, { moduleCode: 'module_c_rh' })
  async getTodayAttendance(@Req() req: any) {
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    return this.attendanceService.getTodayAttendance(employeeId);
  }

  @Get('my')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_OWN, { moduleCode: 'module_c_rh' })
  async getMyAttendance(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    return this.attendanceService.getEmployeeAttendance(
      employeeId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('my/stats')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_OWN, { moduleCode: 'module_c_rh' })
  async getMyMonthlyStats(
    @Req() req: any,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    return this.attendanceService.getMonthlyStats(
      employeeId,
      parseInt(month),
      parseInt(year),
    );
  }

  @Get('team/my')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_TEAM, { moduleCode: 'module_c_rh' })
  async getMyTeamAttendance(
    @Req() req: any,
    @Query('date') date?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    const userEmployeeId = req.user.employeeId;

    if (!userEmployeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    const dateFilter = date ? new Date(date) : null;

    return this.attendanceService.getTeamAttendance(
      organizationId,
      '',
      dateFilter,
    );
  }

  @Get('team')
  @RequirePermission([HR_PERMISSIONS.HR_ATTENDANCE_READ_ALL, HR_PERMISSIONS.HR_ATTENDANCE_READ_TEAM], { moduleCode: 'module_c_rh' })
  async getTeamAttendance(
    @Req() req: any,
    @Query('departmentId') departmentId?: string,
    @Query('date') date?: string,
    @Query('all') all?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    const userEmail = req.user.email;

    console.log('[AttendanceController] getTeamAttendance - user:', userEmail, 'tenantOrgId:', tenant?.id, 'userOrgId:', req.user.organizationId, 'usingOrgId:', organizationId, 'all:', all);

    const dateFilter = all === 'true' ? null : (date ? new Date(date) : null);

    const result = await this.attendanceService.getTeamAttendance(
      organizationId,
      departmentId ?? '',
      dateFilter,
    );

    console.log('[AttendanceController] Returning', result?.length ?? 0, 'records');
    return result;
  }

  @Get('team/stats/my')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_TEAM, { moduleCode: 'module_c_rh' })
  async getMyTeamStats(
    @Req() req: any,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    const userEmployeeId = req.user.employeeId;

    if (!userEmployeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    return this.attendanceService.getTeamStats(organizationId, '');
  }

  @Get('team/stats')
  @RequirePermission([HR_PERMISSIONS.HR_ATTENDANCE_READ_ALL, HR_PERMISSIONS.HR_ATTENDANCE_READ_TEAM], { moduleCode: 'module_c_rh' })
  async getTeamStats(
    @Req() req: any,
    @Query('departmentId') departmentId?: string,
  ) {
    // Utiliser l'organisation du tenant (header x-organization-code)
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;

    return this.attendanceService.getTeamStats(organizationId, departmentId);
  }

  @Post('justify')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_JUSTIFY, { moduleCode: 'module_c_rh' })
  async justifyAbsence(
    @Req() req: any,
    @Body() body: {
      attendanceId: string;
      notes: string;
      documentUrl?: string;
    },
  ) {
    const organizationId = req.user.organizationId;
    const userId = req.user.id;

    return this.attendanceService.justifyAbsence(organizationId, body, userId);
  }

  @Post('mark-absent')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_MANAGE, { moduleCode: 'module_c_rh' })
  async markAsAbsent(
    @Req() req: any,
    @Body() body: {
      employeeId: string;
      date: string;
    },
  ) {
    const organizationId = req.user.organizationId;

    return this.attendanceService.markAsAbsent(
      body.employeeId,
      new Date(body.date),
      organizationId,
    );
  }

  @Get('history/my')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_OWN, { moduleCode: 'module_c_rh' })
  async getMyHistory(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('statusType') statusType?: 'positive' | 'negative',
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    const userEmployeeId = req.user.employeeId;

    if (!userEmployeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    const filters: {
      employeeId: string;
      startDate?: Date;
      endDate?: Date;
      statusType?: 'positive' | 'negative';
    } = { employeeId: userEmployeeId };

    if (startDate) {
      filters.startDate = new Date(startDate);
    }
    if (endDate) {
      filters.endDate = new Date(endDate);
    }
    if (statusType) {
      filters.statusType = statusType;
    }

    return this.attendanceService.getAttendanceHistory(organizationId, filters);
  }

  @Get('history')
  @RequirePermission([HR_PERMISSIONS.HR_ATTENDANCE_READ_ALL, HR_PERMISSIONS.HR_ATTENDANCE_READ_OWN], { moduleCode: 'module_c_rh' })
  async getHistory(
    @Req() req: any,
    @Query('employeeId') employeeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('statusType') statusType?: 'positive' | 'negative',
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    const userEmployeeId = req.user.employeeId;
    const hasAllPermission = req.permissionCodes?.includes(HR_PERMISSIONS.HR_ATTENDANCE_READ_ALL);

    // Les employés normaux ne voient que leur propre historique
    // Les users avec permission peuvent voir tous ou filtrer par employeeId
    const filters: {
      employeeId?: string;
      startDate?: Date;
      endDate?: Date;
      statusType?: 'positive' | 'negative';
    } = {};

    if (!hasAllPermission) {
      if (!userEmployeeId) {
        throw new ForbiddenException('Employé non trouvé');
      }
      filters.employeeId = userEmployeeId;
    } else {
      if (employeeId) {
        filters.employeeId = employeeId;
      }
    }

    if (startDate) {
      filters.startDate = new Date(startDate);
    }
    if (endDate) {
      filters.endDate = new Date(endDate);
    }
    if (statusType) {
      filters.statusType = statusType;
    }

    return this.attendanceService.getAttendanceHistory(organizationId, filters);
  }

}
