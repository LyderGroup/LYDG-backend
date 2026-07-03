import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { AttendanceService } from '../services/attendance-new.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

class CheckInDto {
  @IsString() employeeId!: string;
}

class CheckOutDto {
  @IsString() employeeId!: string;
}

class JustifyDto {
  @IsString() notes!: string;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) { }

  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_ALL, { moduleCode: 'module_c_rh' })
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const page = query.page ? parseInt(query.page as string, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit as string, 10) : undefined;
    const employeeId = typeof query.employeeId === 'string' ? query.employeeId : undefined;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const status = typeof query.status === 'string' ? query.status : undefined;

    return this.service.findPage(tenant?.id as string, {
      page, limit, employeeId, startDate, endDate, status,
    });
  }

  @Get('stats')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_ALL, { moduleCode: 'module_c_rh' })
  async stats(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const startDate = query.startDate ? new Date(query.startDate) : new Date(new Date().setDate(1));
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    return this.service.getStats(tenant?.id as string, startDate, endDate);
  }

  @Get(':id')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_ALL, { moduleCode: 'module_c_rh' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Pointage non trouvé');
    return item;
  }

  @Post('check-in')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_WRITE, { moduleCode: 'module_c_rh' })
  async checkIn(@Body() dto: CheckInDto) {
    return this.service.checkIn(dto.employeeId);
  }

  @Post('check-out')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_WRITE, { moduleCode: 'module_c_rh' })
  async checkOut(@Body() dto: CheckOutDto) {
    return this.service.checkOut(dto.employeeId);
  }

  @Post(':id/justify')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_JUSTIFY, { moduleCode: 'module_c_rh' })
  async justify(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: JustifyDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    if (!dto.notes?.trim()) {
      throw new BadRequestException('Les notes de justification sont obligatoires');
    }
    return this.service.justify(tenant?.id as string, id, currentUser?.id as string, dto.notes);
  }

  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_MANAGE, { moduleCode: 'module_c_rh' })
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
