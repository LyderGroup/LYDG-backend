import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AutomaticSanctionService } from '../services/automatic-sanction.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

@UseGuards(PermissionGuard)
@Controller('core/hr/sanctions')
export class SanctionController {
  constructor(private readonly sanctionService: AutomaticSanctionService) { }

  @Post('check-all')
  @RequirePermission(HR_PERMISSIONS.HR_SANCTIONS_WRITE, { moduleCode: 'module_c_rh' })
  async checkAllSanctions(@Req() req: any) {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }
    await this.sanctionService.checkAndApplySanctions(organizationId);
    return { message: 'Vérification des sanctions effectuée' };
  }

  @Get('stats/:employeeId')
  @RequirePermission([HR_PERMISSIONS.HR_SANCTIONS_READ_ALL, HR_PERMISSIONS.HR_SANCTIONS_READ_OWN], { moduleCode: 'module_c_rh' })
  async getEmployeeStats(@Req() req: any, @Param('employeeId') employeeId: string) {
    const currentEmployeeId = req.user?.employeeId;
    const hasAllPermission = req.permissionCodes?.includes(HR_PERMISSIONS.HR_SANCTIONS_READ_ALL);

    if (!hasAllPermission && employeeId !== currentEmployeeId) {
      throw new BadRequestException('Accès non autorisé');
    }

    return this.sanctionService.getEmployeeSanctionStats(employeeId);
  }

  @Post('check/:employeeId')
  @RequirePermission(HR_PERMISSIONS.HR_SANCTIONS_WRITE, { moduleCode: 'module_c_rh' })
  async checkEmployeeSanction(@Req() req: any, @Param('employeeId') employeeId: string) {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Organisation non trouvée');
    }

    const sanction = await this.sanctionService.checkEmployeeSanctions(employeeId, organizationId);
    return {
      applied: !!sanction,
      sanction: sanction || null,
    };
  }

  @Post(':id/approve')
  @RequirePermission(HR_PERMISSIONS.HR_SANCTIONS_APPROVE, { moduleCode: 'module_c_rh' })
  async approveSanction(
    @Req() req: any,
    @Param('id') sanctionId: string,
    @Body() body: { notes?: string },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('Utilisateur non trouvé');
    }

    return this.sanctionService.approveSanction(sanctionId, userId, body.notes);
  }

  @Post(':id/cancel')
  @RequirePermission(HR_PERMISSIONS.HR_SANCTIONS_APPROVE, { moduleCode: 'module_c_rh' })
  async cancelSanction(
    @Req() req: any,
    @Param('id') sanctionId: string,
    @Body() body: { reason: string },
  ) {
    if (!body.reason) {
      throw new BadRequestException('La raison de l\'annulation est obligatoire');
    }

    return this.sanctionService.cancelSanction(sanctionId, body.reason);
  }
}
