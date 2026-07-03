import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { CompanyRitualService } from '../services/company-ritual.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';
import { RitualType } from '../entities/company-ritual.entity';

class CreateRitualDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(RitualType) ritualType!: RitualType;
  @IsOptional() @IsString() scheduledTime?: string;
  @IsOptional() @IsNumber() dayOfWeek?: number;
  @IsOptional() @IsNumber() dayOfMonth?: number;
  @IsOptional() @IsNumber() durationMinutes?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) participantRoles?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) checklistItems?: string[];
  @IsOptional() @IsBoolean() isMandatory?: boolean;
}

class MarkAttendanceDto {
  @IsString() employeeId!: string;
  @IsBoolean() isPresent!: boolean;
  @IsOptional() @IsString() contribution?: string;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/rituals')
export class CompanyRitualController {
  constructor(private readonly service: CompanyRitualService) { }

  @Get()
  @RequirePermission([HR_PERMISSIONS.HR_RITUALS_READ, HR_PERMISSIONS.HR_RITUALS_READ_OWN], { moduleCode: 'module_c_rh' })
  async getRituals(@Req() req: any, @Query('type') type?: RitualType) {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }
    return this.service.getRituals(organizationId, type);
  }

  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_RITUALS_WRITE, { moduleCode: 'module_c_rh' })
  async createRitual(@Req() req: any, @Body() dto: CreateRitualDto) {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }
    return this.service.createRitual({
      organizationId,
      ...dto,
    });
  }

  @Post('create-defaults')
  @RequirePermission(HR_PERMISSIONS.HR_RITUALS_WRITE, { moduleCode: 'module_c_rh' })
  async createDefaultRituals(@Req() req: any) {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }
    return this.service.createDefaultRituals(organizationId);
  }

  @Get('today')
  @RequirePermission([HR_PERMISSIONS.HR_RITUALS_READ, HR_PERMISSIONS.HR_RITUALS_READ_OWN], { moduleCode: 'module_c_rh' })
  async getTodayRituals(@Req() req: any) {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }
    return this.service.getTodayRituals(organizationId);
  }

  @Get('upcoming')
  @RequirePermission([HR_PERMISSIONS.HR_RITUALS_READ, HR_PERMISSIONS.HR_RITUALS_READ_OWN], { moduleCode: 'module_c_rh' })
  async getUpcomingForEmployee(@Req() req: any, @Query('days') days?: string) {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }
    const daysAhead = days ? parseInt(days, 10) : 7;
    return this.service.getUpcomingForEmployee(employeeId, daysAhead);
  }

  @Post('generate-occurrences')
  @RequirePermission(HR_PERMISSIONS.HR_RITUALS_WRITE, { moduleCode: 'module_c_rh' })
  async generateOccurrences(@Req() req: any, @Query('days') days?: string) {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }
    const daysAhead = days ? parseInt(days, 10) : 30;
    return this.service.generateUpcomingOccurrences(organizationId, daysAhead);
  }

  @Post('occurrences/:id/start')
  @RequirePermission(HR_PERMISSIONS.HR_RITUALS_MANAGE, { moduleCode: 'module_c_rh' })
  async startOccurrence(@Param('id') id: string) {
    return this.service.startOccurrence(id);
  }

  @Post('occurrences/:id/complete')
  @RequirePermission(HR_PERMISSIONS.HR_RITUALS_MANAGE, { moduleCode: 'module_c_rh' })
  async completeOccurrence(@Param('id') id: string, @Body('notes') notes?: string) {
    return this.service.completeOccurrence(id, notes);
  }

  @Post('occurrences/:id/attendance')
  @RequirePermission(HR_PERMISSIONS.HR_RITUALS_MANAGE, { moduleCode: 'module_c_rh' })
  async markAttendance(@Param('id') id: string, @Body() dto: MarkAttendanceDto) {
    return this.service.markAttendance(id, dto.employeeId, dto.isPresent, dto.contribution);
  }

  @Get('stats')
  @RequirePermission([HR_PERMISSIONS.HR_RITUALS_READ, HR_PERMISSIONS.HR_RITUALS_READ_OWN], { moduleCode: 'module_c_rh' })
  async getStats(@Req() req: any, @Query('ritualId') ritualId?: string) {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }
    return this.service.getRitualStats(organizationId, ritualId);
  }
}
