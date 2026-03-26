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
import { AttendanceService } from '../services/attendance-new.service';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';

class CheckInDto {
  employeeId!: string;
}

class CheckOutDto {
  employeeId!: string;
}

class JustifyDto {
  notes!: string;
}

@UseGuards(RolesGuard)
@Controller('core/hr/attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async stats(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const startDate = query.startDate ? new Date(query.startDate) : new Date(new Date().setDate(1));
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    return this.service.getStats(tenant?.id as string, startDate, endDate);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Pointage non trouvé');
    return item;
  }

  @Post('check-in')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT', 'EMPLOYEE')
  async checkIn(@Body() dto: CheckInDto) {
    return this.service.checkIn(dto.employeeId);
  }

  @Post('check-out')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT', 'EMPLOYEE')
  async checkOut(@Body() dto: CheckOutDto) {
    return this.service.checkOut(dto.employeeId);
  }

  @Post(':id/justify')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
