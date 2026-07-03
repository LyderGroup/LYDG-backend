import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Req,
  Post,
  Param,
} from '@nestjs/common';
import { EmployeeProfileService } from './employee-profile.service';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from './hr.permissions';

@Controller('core/hr/profile')
@UseGuards(PermissionGuard)
export class EmployeeProfileController {
  constructor(private readonly profileService: EmployeeProfileService) { }

  /**
   * Récupérer le profil de l'employé connecté
   */
  @Get('my')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_OWN, { moduleCode: 'module_c_rh' })
  async getMyProfile(@Req() req: any) {
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      return { profile: null, completionPercentage: 0 };
    }
    return this.profileService.getProfileByEmployeeId(employeeId);
  }

  /**
   * Mettre à jour le profil de l'employé connecté
   */
  @Put('my')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE_OWN, { moduleCode: 'module_c_rh' })
  async updateMyProfile(@Req() req: any, @Body() updateData: any) {
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      return { success: false, message: 'Employé non trouvé' };
    }
    return this.profileService.updateProfile(employeeId, updateData);
  }

  /**
   * Marquer le profil comme complet (signature)
   */
  @Post('my/complete')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE_OWN, { moduleCode: 'module_c_rh' })
  async completeMyProfile(
    @Req() req: any,
    @Body() body: { signatureData: string; signaturePlace: string },
  ) {
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      return { success: false, message: 'Employé non trouvé' };
    }
    return this.profileService.completeProfile(
      employeeId,
      body.signatureData,
      body.signaturePlace,
    );
  }

  /**
   * Récupérer les statistiques de complétion des profils (admin/HR)
   */
  @Get('stats/completion')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, { moduleCode: 'module_c_rh' })
  async getCompletionStats(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user.organizationId;
    return this.profileService.getCompletionStats(organizationId);
  }

  /**
   * Récupérer le profil d'un employé (admin/HR)
   */
  @Get(':employeeId')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, { moduleCode: 'module_c_rh' })
  async getEmployeeProfile(@Req() req: any, @Param('employeeId') employeeId: string) {
    return this.profileService.getProfileByEmployeeId(employeeId);
  }

  /**
   * Valider le profil d'un employé (admin/HR)
   */
  @Post(':employeeId/validate')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE_ALL, { moduleCode: 'module_c_rh' })
  async validateProfile(@Req() req: any, @Param('employeeId') employeeId: string) {
    return this.profileService.validateProfile(employeeId, req.user.id);
  }
}
