import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { RegulationService } from '../services/regulation.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

@Controller('core/hr/regulations')
@UseGuards(PermissionGuard)
export class RegulationController {
  constructor(private readonly regulationService: RegulationService) { }


  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_WRITE, { moduleCode: 'module_c_rh' })
  async createRegulation(
    @Req() req: any,
    @Body() body: {
      title: string;
      version: string;
      description?: string;
      contentHtml: string;
      contentSummary?: string;
      effectiveDate: string;
      expiryDate?: string;
      requiresSignature?: boolean;
      signatureDeadlineDays?: number;
      allowDownload?: boolean;
      allowPrint?: boolean;
      allowCopy?: boolean;
    },
  ) {
    const organizationId = req.user.organizationId;
    const userId = req.user.id;

    return this.regulationService.createRegulation(organizationId, userId, {
      ...body,
      effectiveDate: new Date(body.effectiveDate),
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
    });
  }

  @Post(':id/publish')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_WRITE, { moduleCode: 'module_c_rh' })
  async publishRegulation(
    @Req() req: any,
    @Param('id') regulationId: string,
  ) {
    const organizationId = req.user.organizationId;
    const userId = req.user.id;

    return this.regulationService.publishRegulation(organizationId, regulationId, userId);
  }

  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ_ALL, { moduleCode: 'module_c_rh' })
  async listRegulations(
    @Req() req: any,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const organizationId = req.user.organizationId;
    return this.regulationService.listRegulations(
      organizationId,
      includeArchived === 'true',
    );
  }

  @Get('active')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ_OWN, { moduleCode: 'module_c_rh' })
  async getActiveRegulation(@Req() req: any) {
    const organizationId = req.user.organizationId;
    return this.regulationService.getActiveRegulation(organizationId);
  }

  @Get(':id/stats')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ_ALL, { moduleCode: 'module_c_rh' })
  async getSignatureStats(
    @Req() req: any,
    @Param('id') regulationId: string,
  ) {
    const organizationId = req.user.organizationId;
    return this.regulationService.getSignatureStats(organizationId, regulationId);
  }


  @Get('my/pending')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ_OWN, { moduleCode: 'module_c_rh' })
  async getMyPendingAssignments(@Req() req: any) {
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    return this.regulationService.getPendingAssignments(employeeId);
  }

  @Post('assignments/:id/view')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ_OWN, { moduleCode: 'module_c_rh' })
  async markAsViewed(@Param('id') assignmentId: string) {
    await this.regulationService.markAsViewed(assignmentId);
    return { success: true };
  }

  @Post('assignments/:id/sign')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_SIGN, { moduleCode: 'module_c_rh' })
  async signRegulation(
    @Req() req: any,
    @Param('id') assignmentId: string,
    @Body() body: {
      signatureData: string;
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
      geolocation?: Record<string, any>;
    },
  ) {
    const organizationId = req.user.organizationId;
    const userId = req.user.id;

    return this.regulationService.signRegulation(organizationId, userId, {
      assignmentId,
      ...body,
    });
  }

  @Post('assignments/:id/refuse')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_SIGN, { moduleCode: 'module_c_rh' })
  async refuseRegulation(
    @Param('id') assignmentId: string,
    @Body() body: { reason: string },
  ) {
    return this.regulationService.refuseRegulation(assignmentId, body.reason);
  }


  @Get('verify/:code')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ_OWN, { moduleCode: 'module_c_rh' })
  async verifySignature(@Param('code') code: string) {
    return this.regulationService.verifySignature(code);
  }
}
