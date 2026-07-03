import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { EmployeeInitiationService } from '../services/employee-initiation.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

class StartInitiationDto {
  @IsString() employeeId!: string;
}

class SubmitQuizDto {
  @IsString() employeeId!: string;
  @IsNumber() score!: number;
}

class AssignSponsorDto {
  @IsString() employeeId!: string;
  @IsString() sponsorId!: string;
}

class CompleteStepDto {
  @IsString() employeeId!: string;
  @IsString() step!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() documentUrl?: string;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/initiations')
export class EmployeeInitiationController {
  constructor(private readonly service: EmployeeInitiationService) { }

  @Post('start')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async startInitiation(@Body() dto: StartInitiationDto) {
    return this.service.startInitiation({ employeeId: dto.employeeId });
  }

  @Post('quiz')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_OWN, { moduleCode: 'module_c_rh' })
  async submitQuiz(@Req() req: any, @Body() dto: SubmitQuizDto) {
    const employeeId = dto.employeeId || req.user?.employeeId;
    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }
    return this.service.submitQuiz({ employeeId, score: dto.score });
  }

  @Post('sponsor')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async assignSponsor(@Body() dto: AssignSponsorDto) {
    return this.service.assignSponsor({
      employeeId: dto.employeeId,
      sponsorId: dto.sponsorId,
    });
  }

  @Post('complete-step')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async completeStep(@Body() dto: CompleteStepDto) {
    return this.service.completeStep({
      employeeId: dto.employeeId,
      step: dto.step,
      notes: dto.notes,
      documentUrl: dto.documentUrl,
    });
  }

  @Get('progress/:employeeId')
  @RequirePermission([HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, HR_PERMISSIONS.HR_EMPLOYEES_READ_OWN], { moduleCode: 'module_c_rh' })
  async getProgress(@Req() req: any, @Param('employeeId') employeeId: string) {
    const currentEmployeeId = req.user?.employeeId;
    const hasAllPermission = req.permissionCodes?.includes(HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL);

    if (!hasAllPermission && employeeId !== currentEmployeeId) {
      throw new BadRequestException('Accès non autorisé');
    }

    return this.service.getInitiationProgress(employeeId);
  }

  @Get('pending')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, { moduleCode: 'module_c_rh' })
  async getPendingInitiations(@Req() req: any) {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }
    return this.service.getPendingInitiations(organizationId);
  }

  @Get('eligible-sponsors')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, { moduleCode: 'module_c_rh' })
  async getEligibleSponsors(@Req() req: any) {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }
    return this.service.getEligibleSponsors(organizationId);
  }
}
