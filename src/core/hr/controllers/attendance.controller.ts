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
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';

@Controller('core/hr/attendance')
@UseGuards(RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}
 

  @Post('check-in')
  async checkIn(
    @Req() req: any,
    @Body() body: {
      scheduledCheckIn?: string;
      scheduledCheckOut?: string;
      scheduledHours?: number;
    },
  ) {
    const organizationId = req.user.organizationId;
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé');
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

  @Get('today')
  async getTodayAttendance(@Req() req: any) {
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    return this.attendanceService.getTodayAttendance(employeeId);
  }

  @Get('my')
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
 

  @Get('team')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async getTeamAttendance(
    @Req() req: any,
    @Query('departmentId') departmentId?: string,
    @Query('date') date?: string,
  ) {
    const organizationId = req.user.organizationId;

    return this.attendanceService.getTeamAttendance(
      organizationId,
      departmentId ?? '',
      date ? new Date(date) : new Date(),
    );
  }

  @Get('team/stats')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async getTeamMonthlyStats(
    @Req() req: any,
    @Query('departmentId') departmentId?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const organizationId = req.user.organizationId;

    const now = new Date();

    return this.attendanceService.getTeamMonthlyStats(
      organizationId,
      departmentId ?? '',
      month ? parseInt(month) : now.getMonth() + 1,
      year ? parseInt(year) : now.getFullYear(),
    );
  }

  @Post('justify')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
}
