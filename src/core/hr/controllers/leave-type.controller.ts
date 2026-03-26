import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LeaveTypeService } from '../services/leave-type.service';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';

class CreateLeaveTypeDto {
  name!: string;
  code!: string;
  description?: string | null;
  daysPerYear!: number;
  accrualMethod?: string;
  maxCarryOver?: number;
  isPaid?: boolean;
  requiresApproval?: boolean;
  minDurationDays?: number;
  maxDurationDays?: number | null;
  advanceNoticeDays?: number;
  color?: string;
  icon?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

class UpdateLeaveTypeDto {
  name?: string;
  code?: string;
  description?: string | null;
  daysPerYear?: number;
  accrualMethod?: string;
  maxCarryOver?: number;
  isPaid?: boolean;
  requiresApproval?: boolean;
  minDurationDays?: number;
  maxDurationDays?: number | null;
  advanceNoticeDays?: number;
  color?: string;
  icon?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

@UseGuards(RolesGuard)
@Controller('core/hr/leave-types')
export class LeaveTypeController {
  constructor(private readonly service: LeaveTypeService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT', 'EMPLOYEE')
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findAll(tenant?.id as string);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Type de congé non trouvé');
    return item;
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async create(@Req() req: any, @Body() dto: CreateLeaveTypeDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    if (!dto.name?.trim()) throw new BadRequestException('Le nom est obligatoire');
    if (!dto.code?.trim()) throw new BadRequestException('Le code est obligatoire');
    if (dto.daysPerYear === undefined || dto.daysPerYear < 0) {
      throw new BadRequestException('Le nombre de jours par an est obligatoire');
    }

    return this.service.create(tenant?.id as string, {
      name: dto.name.trim(),
      code: dto.code.trim(),
      description: dto.description ?? null,
      daysPerYear: dto.daysPerYear,
      accrualMethod: dto.accrualMethod,
      maxCarryOver: dto.maxCarryOver,
      isPaid: dto.isPaid,
      requiresApproval: dto.requiresApproval,
      minDurationDays: dto.minDurationDays,
      maxDurationDays: dto.maxDurationDays,
      advanceNoticeDays: dto.advanceNoticeDays,
      color: dto.color,
      icon: dto.icon,
      displayOrder: dto.displayOrder,
      isActive: dto.isActive,
    });
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateLeaveTypeDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
