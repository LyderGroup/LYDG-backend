import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, IsNull } from 'typeorm';
import { OfficeAttendance, AttendanceStatus } from '../entities/office-attendance.entity';
import { Employee } from '../employee.entity';

export interface CheckInInput {
  employeeId: string;
  scheduledCheckIn?: string;
  scheduledCheckOut?: string;
  scheduledHours?: number;
}

export interface CheckOutInput {
  attendanceId: string;
}

export interface JustifyAbsenceInput {
  attendanceId: string;
  notes: string;
  documentUrl?: string;
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(OfficeAttendance)
    private readonly attendanceRepo: Repository<OfficeAttendance>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly dataSource: DataSource,
  ) { }

  async checkIn(
    organizationId: string,
    input: CheckInInput,
  ): Promise<OfficeAttendance> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await this.attendanceRepo.findOne({
      where: {
        employeeId: input.employeeId,
        attendanceDate: today,
      },
    });

    if (existing && existing.actualCheckIn) {
      throw new BadRequestException('Vous avez déjà pointé votre arrivée aujourd\'hui');
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
 
    let status: AttendanceStatus = 'present';
    const defaultCheckIn = '09:00';

    if (input.scheduledCheckIn) {
      const scheduled = this.timeToMinutes(input.scheduledCheckIn);
      const actual = this.timeToMinutes(currentTime);

      if (actual > scheduled + 15) { 
        status = 'late';
      }
    }

    if (existing) {
      existing.actualCheckIn = currentTime;
      existing.status = status;
      return this.attendanceRepo.save(existing);
    }

    const attendance = this.attendanceRepo.create({
      employeeId: input.employeeId,
      organizationId,
      attendanceDate: today,
      scheduledCheckIn: input.scheduledCheckIn ?? defaultCheckIn,
      scheduledCheckOut: input.scheduledCheckOut ?? '18:00',
      scheduledHours: input.scheduledHours ?? 8,
      actualCheckIn: currentTime,
      status,
    });

    return this.attendanceRepo.save(attendance);
  }

  async checkOut(input: CheckOutInput): Promise<OfficeAttendance> {
    const attendance = await this.attendanceRepo.findOne({
      where: { id: input.attendanceId },
    });

    if (!attendance) {
      throw new NotFoundException('Pointage non trouvé');
    }

    if (!attendance.actualCheckIn) {
      throw new BadRequestException('Vous devez d\'abord pointer votre arrivée');
    }

    if (attendance.actualCheckOut) {
      throw new BadRequestException('Vous avez déjà pointé votre départ');
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    attendance.actualCheckOut = currentTime;
 
    const checkInMinutes = this.timeToMinutes(attendance.actualCheckIn);
    const checkOutMinutes = this.timeToMinutes(currentTime);
    const workedMinutes = checkOutMinutes - checkInMinutes;
    attendance.actualHours = Math.round((workedMinutes / 60) * 100) / 100;
 
    if (attendance.actualHours < (attendance.scheduledHours ?? 8) - 0.5) {
      attendance.status = 'early_leave';
    }

    return this.attendanceRepo.save(attendance);
  }
 

  async justifyAbsence(
    organizationId: string,
    input: JustifyAbsenceInput,
    validatedBy: string,
  ): Promise<OfficeAttendance> {
    const attendance = await this.attendanceRepo.findOne({
      where: { id: input.attendanceId, organizationId },
    });

    if (!attendance) {
      throw new NotFoundException('Pointage non trouvé');
    }

    attendance.isJustified = true;
    attendance.justificationNotes = input.notes;
    attendance.justificationDocumentUrl = input.documentUrl ?? null;
    attendance.validatedBy = validatedBy;
    attendance.validatedAt = new Date();

    return this.attendanceRepo.save(attendance);
  }

  async markAsAbsent(
    employeeId: string,
    date: Date,
    organizationId: string,
  ): Promise<OfficeAttendance> {
    const attendance = this.attendanceRepo.create({
      employeeId,
      organizationId,
      attendanceDate: date,
      status: 'absent' as AttendanceStatus,
    });

    return this.attendanceRepo.save(attendance);
  }


  async getEmployeeAttendance(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<OfficeAttendance[]> {
    return this.attendanceRepo.find({
      where: {
        employeeId,
        attendanceDate: Between(startDate, endDate),
        deletedAt: IsNull() as any,
      },
      order: { attendanceDate: 'ASC' },
    });
  }

  async getTeamAttendance(
    organizationId: string,
    departmentId: string,
    date: Date,
  ): Promise<OfficeAttendance[]> {
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);

    const query = this.attendanceRepo
      .createQueryBuilder('a')
      .innerJoin('a.employee', 'e')
      .where('a.organizationId = :orgId', { orgId: organizationId })
      .andWhere('a.attendanceDate = :date', { date: dateStart })
      .andWhere('a.deletedAt IS NULL');

    if (departmentId) {
      query.andWhere('e.departmentId = :deptId', { deptId: departmentId });
    }

    return query.getMany();
  }

  async getTodayAttendance(employeeId: string): Promise<OfficeAttendance | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.attendanceRepo.findOne({
      where: {
        employeeId,
        attendanceDate: today,
      },
    });
  }
 

  async getMonthlyStats(
    employeeId: string,
    month: number,
    year: number,
  ): Promise<{
    totalDays: number;
    presentDays: number;
    absentDays: number;
    lateDays: number;
    earlyLeaveDays: number;
    totalHours: number;
    avgHoursPerDay: number;
  }> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const attendances = await this.getEmployeeAttendance(employeeId, startDate, endDate);

    const presentDays = attendances.filter(a =>
      ['present', 'late', 'early_leave', 'partial'].includes(a.status)
    ).length;

    const totalHours = attendances
      .filter(a => a.actualHours)
      .reduce((sum, a) => sum + (a.actualHours ?? 0), 0);

    return {
      totalDays: attendances.length,
      presentDays,
      absentDays: attendances.filter(a => a.status === 'absent').length,
      lateDays: attendances.filter(a => a.status === 'late').length,
      earlyLeaveDays: attendances.filter(a => a.status === 'early_leave').length,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHoursPerDay: presentDays > 0 ? Math.round((totalHours / presentDays) * 100) / 100 : 0,
    };
  }

  async getTeamMonthlyStats(
    organizationId: string,
    departmentId: string,
    month: number,
    year: number,
  ): Promise<{
    employeeId: string;
    employeeName: string;
    presentDays: number;
    absentDays: number;
    lateDays: number;
    totalHours: number;
  }[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
 
    const employeeQuery = this.employeeRepo
      .createQueryBuilder('e')
      .where('e.organizationId = :orgId', { orgId: organizationId })
      .andWhere('e.isActive = true');

    if (departmentId) {
      employeeQuery.andWhere('e.departmentId = :deptId', { deptId: departmentId });
    }

    const employees = await employeeQuery.getMany();

    const stats: Array<{
      employeeId: string;
      employeeName: string;
      presentDays: number;
      absentDays: number;
      lateDays: number;
      totalHours: number;
    }> = [];

    for (const emp of employees) {
      const attendances = await this.getEmployeeAttendance(emp.id, startDate, endDate);

      stats.push({
        employeeId: emp.id,
        employeeName: emp.user ? `${emp.user.firstName} ${emp.user.lastName}` : emp.employeeNumber,
        presentDays: attendances.filter(a =>
          ['present', 'late', 'early_leave', 'partial'].includes(a.status)
        ).length,
        absentDays: attendances.filter(a => a.status === 'absent').length,
        lateDays: attendances.filter(a => a.status === 'late').length,
        totalHours: attendances
          .filter(a => a.actualHours)
          .reduce((sum, a) => sum + (a.actualHours ?? 0), 0),
      });
    }

    return stats;
  }


  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}
