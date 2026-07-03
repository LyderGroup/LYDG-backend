import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance, AttendanceStatus } from '../entities/attendance.entity';

interface CreateAttendanceInput {
  employeeId: string;
  attendanceDate: Date;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  scheduledHours?: number | null;
  checkIn?: Date | null;
  checkOut?: Date | null;
  status?: AttendanceStatus;
  lateReason?: string | null;
  absenceReason?: string | null;
  justified?: boolean;
  justificationNotes?: string | null;
}

interface ListAttendanceOptions {
  page?: number;
  limit?: number;
  employeeId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: AttendanceStatus;
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly repo: Repository<Attendance>,
  ) {}

  async findPage(organizationId: string, options: ListAttendanceOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 20;

    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.employee', 'employee')
      .leftJoinAndSelect('a.approver', 'approver')
      .innerJoin('employee.organization', 'org')
      .where('org.id = :orgId', { orgId: organizationId });

    if (options.employeeId) {
      qb.andWhere('a.employee_id = :empId', { empId: options.employeeId });
    }

    if (options.startDate) {
      qb.andWhere('a.attendance_date >= :startDate', { startDate: options.startDate });
    }

    if (options.endDate) {
      qb.andWhere('a.attendance_date <= :endDate', { endDate: options.endDate });
    }

    if (options.status) {
      qb.andWhere('a.status = :status', { status: options.status });
    }

    // orderBy : propriétés camelCase (TypeORM crash sinon avec joins)
    qb.orderBy('a.attendanceDate', 'DESC')
      .addOrderBy('a.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { data: items, meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 } };
  }

  async findOne(organizationId: string, id: string) {
    return this.repo.findOne({
      where: { id },
      relations: ['employee', 'approver'],
    });
  }

  async findByEmployeeAndDate(employeeId: string, date: Date) {
    return this.repo.findOne({
      where: { employeeId, attendanceDate: date },
    });
  }

  async create(input: CreateAttendanceInput) {
    const entity = this.repo.create({
      employeeId: input.employeeId,
      attendanceDate: input.attendanceDate,
      scheduledStartTime: input.scheduledStartTime ?? null,
      scheduledEndTime: input.scheduledEndTime ?? null,
      scheduledHours: input.scheduledHours ?? null,
      checkIn: input.checkIn ?? null,
      checkOut: input.checkOut ?? null,
      status: input.status ?? 'present',
      lateReason: input.lateReason ?? null,
      absenceReason: input.absenceReason ?? null,
      justified: input.justified ?? false,
      justificationNotes: input.justificationNotes ?? null,
    });
    return this.repo.save(entity);
  }

  async checkIn(employeeId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let attendance = await this.findByEmployeeAndDate(employeeId, today);
    if (!attendance) {
      attendance = this.repo.create({
        employeeId,
        attendanceDate: today,
        checkIn: new Date(),
        status: 'present',
      });
    } else if (!attendance.checkIn) {
      attendance.checkIn = new Date();
      attendance.status = 'present';
    }
    return this.repo.save(attendance);
  }

  async checkOut(employeeId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await this.findByEmployeeAndDate(employeeId, today);
    if (!attendance) {
      throw new Error('Aucun pointage d\'entrée trouvé pour aujourd\'hui');
    }

    attendance.checkOut = new Date();
    return this.repo.save(attendance);
  }

  async justify(organizationId: string, id: string, approvedBy: string, notes: string) {
    await this.repo.update({ id }, {
      justified: true,
      justificationNotes: notes,
      approvedBy,
      approvedAt: new Date(),
    } as any);
    return this.findOne(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    await this.repo.delete({ id });
    return { deleted: true };
  }

  async getStats(organizationId: string, startDate: Date, endDate: Date) {
    const stats = await this.repo
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .innerJoin('a.employee', 'e')
      .where('e.organization_id = :orgId', { orgId: organizationId })
      .andWhere('a.attendance_date >= :startDate', { startDate })
      .andWhere('a.attendance_date <= :endDate', { endDate })
      .groupBy('a.status')
      .getRawMany();

    return stats;
  }

}
