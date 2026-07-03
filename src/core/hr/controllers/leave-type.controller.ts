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
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { LeaveTypeService } from '../services/leave-type.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

class CreateLeaveTypeDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsNumber() daysPerYear!: number;
  @IsOptional() @IsString() accrualMethod?: string;
  @IsOptional() @IsNumber() maxCarryOver?: number;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @IsOptional() @IsNumber() minDurationDays?: number;
  @IsOptional() @IsNumber() maxDurationDays?: number | null;
  @IsOptional() @IsNumber() advanceNoticeDays?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() icon?: string | null;
  @IsOptional() @IsNumber() displayOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateLeaveTypeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsNumber() daysPerYear?: number;
  @IsOptional() @IsString() accrualMethod?: string;
  @IsOptional() @IsNumber() maxCarryOver?: number;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @IsOptional() @IsNumber() minDurationDays?: number;
  @IsOptional() @IsNumber() maxDurationDays?: number | null;
  @IsOptional() @IsNumber() advanceNoticeDays?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() icon?: string | null;
  @IsOptional() @IsNumber() displayOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/leave-types')
export class LeaveTypeController {
  constructor(private readonly service: LeaveTypeService) { }

  @Get()
  @RequirePermission([HR_PERMISSIONS.HR_LEAVE_READ_OWN, HR_PERMISSIONS.HR_LEAVE_READ_ALL], { moduleCode: 'module_c_rh' })
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findAll(tenant?.id as string);
  }

  @Get(':id')
  @RequirePermission([HR_PERMISSIONS.HR_LEAVE_READ_OWN, HR_PERMISSIONS.HR_LEAVE_READ_ALL], { moduleCode: 'module_c_rh' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Type de congé non trouvé');
    return item;
  }

  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
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
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateLeaveTypeDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, dto);
  }

  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
