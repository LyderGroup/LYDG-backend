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
import { LeaveRequestService } from '../services/leave-request.service';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';

class CreateLeaveRequestDto {
  employeeId!: string;
  leaveTypeId!: string;
  startDate!: string;
  endDate!: string;
  startPeriod?: string;
  endPeriod?: string;
  totalDays!: number;
  reason?: string | null;
  destination?: string | null;
  emergencyContact?: string | null;
  substituteEmployeeId?: string | null;
  handoverNotes?: string | null;
}

class ApproveLeaveRequestDto {
  notes?: string;
}

class RejectLeaveRequestDto {
  reason!: string;
}

@UseGuards(RolesGuard)
@Controller('core/hr/leave-requests')
export class LeaveRequestController {
  constructor(private readonly service: LeaveRequestService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const page = query.page ? parseInt(query.page as string, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit as string, 10) : undefined;
    const employeeId = typeof query.employeeId === 'string' ? query.employeeId : undefined;
    const status = typeof query.status === 'string' ? query.status : undefined;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    return this.service.findPage(tenant?.id as string, {
      page, limit, employeeId, status, startDate, endDate,
    });
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT', 'EMPLOYEE')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Demande de congé non trouvée');
    return item;
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT', 'EMPLOYEE')
  async create(@Req() req: any, @Body() dto: CreateLeaveRequestDto) {
    if (!dto.employeeId) throw new BadRequestException('L\'employé est obligatoire');
    if (!dto.leaveTypeId) throw new BadRequestException('Le type de congé est obligatoire');
    if (!dto.startDate) throw new BadRequestException('La date de début est obligatoire');
    if (!dto.endDate) throw new BadRequestException('La date de fin est obligatoire');
    if (dto.totalDays === undefined || dto.totalDays <= 0) {
      throw new BadRequestException('Le nombre de jours est obligatoire');
    }

    return this.service.create({
      employeeId: dto.employeeId,
      leaveTypeId: dto.leaveTypeId,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      startPeriod: dto.startPeriod,
      endPeriod: dto.endPeriod,
      totalDays: dto.totalDays,
      reason: dto.reason ?? null,
      destination: dto.destination ?? null,
      emergencyContact: dto.emergencyContact ?? null,
      substituteEmployeeId: dto.substituteEmployeeId ?? null,
      handoverNotes: dto.handoverNotes ?? null,
    });
  }

  @Post(':id/approve')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async approve(@Req() req: any, @Param('id') id: string, @Body() dto: ApproveLeaveRequestDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    return this.service.approve(tenant?.id as string, id, currentUser?.id as string, dto.notes);
  }

  @Post(':id/reject')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectLeaveRequestDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Le motif de rejet est obligatoire');
    }
    return this.service.reject(tenant?.id as string, id, currentUser?.id as string, dto.reason);
  }

  @Post(':id/cancel')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'EMPLOYEE')
  async cancel(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.cancel(tenant?.id as string, id);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
