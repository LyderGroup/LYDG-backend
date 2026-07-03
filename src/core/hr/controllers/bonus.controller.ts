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
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';
import { BonusService } from '../services/bonus.service';

@UseGuards(PermissionGuard)
@Controller('core/hr/bonuses')
export class BonusController {
  constructor(private readonly bonusService: BonusService) { }

  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_SALARY_READ_ALL, { moduleCode: 'module_c_rh' })
  async listBonuses(
    @Req() req: any,
    @Query('employeeId') employeeId?: string,
    @Query('periodMonth') periodMonth?: string,
    @Query('periodYear') periodYear?: string,
    @Query('status') status?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.bonusService.listBonuses(organizationId, {
      employeeId,
      periodMonth: periodMonth ? parseInt(periodMonth, 10) : undefined,
      periodYear: periodYear ? parseInt(periodYear, 10) : undefined,
      status: status as any,
    });
  }

  @Get('employee/:employeeId')
  @RequirePermission([HR_PERMISSIONS.HR_SALARY_READ_OWN, HR_PERMISSIONS.HR_SALARY_READ_ALL], { moduleCode: 'module_c_rh' })
  async getEmployeeBonuses(
    @Req() req: any,
    @Param('employeeId') employeeId: string,
  ) {
    const currentEmployeeId = req.user?.employeeId;
    const hasAllPermission = req.permissionCodes?.includes(HR_PERMISSIONS.HR_SALARY_READ_ALL);

    if (!hasAllPermission && employeeId !== currentEmployeeId) {
      throw new BadRequestException('Accès non autorisé');
    }

    return this.bonusService.getEmployeeBonuses(employeeId);
  }

  @Post(':id/approve')
  @RequirePermission(HR_PERMISSIONS.HR_BONUS_APPROVE, { moduleCode: 'module_c_rh' })
  async approveBonus(
    @Req() req: any,
    @Param('id') bonusId: string,
    @Body() body: { notes?: string },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('Utilisateur non trouvé');
    }

    return this.bonusService.approveBonus(bonusId, userId, body.notes);
  }

  @Post(':id/cancel')
  @RequirePermission(HR_PERMISSIONS.HR_BONUS_APPROVE, { moduleCode: 'module_c_rh' })
  async cancelBonus(
    @Req() req: any,
    @Param('id') bonusId: string,
    @Body() body: { reason: string },
  ) {
    if (!body.reason) {
      throw new BadRequestException('La raison de l\'annulation est obligatoire');
    }

    return this.bonusService.cancelBonus(bonusId, body.reason);
  }
}
