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
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';

@Controller('core/hr/regulations')
@UseGuards(RolesGuard)
export class RegulationController {
  constructor(private readonly regulationService: RegulationService) { }
 

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async publishRegulation(
    @Req() req: any,
    @Param('id') regulationId: string,
  ) {
    const organizationId = req.user.organizationId;
    const userId = req.user.id;

    return this.regulationService.publishRegulation(organizationId, regulationId, userId);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
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
  async getActiveRegulation(@Req() req: any) {
    const organizationId = req.user.organizationId;
    return this.regulationService.getActiveRegulation(organizationId);
  }

  @Get(':id/stats')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async getSignatureStats(
    @Req() req: any,
    @Param('id') regulationId: string,
  ) {
    const organizationId = req.user.organizationId;
    return this.regulationService.getSignatureStats(organizationId, regulationId);
  }
 

  @Get('my/pending')
  async getMyPendingAssignments(@Req() req: any) {
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    return this.regulationService.getPendingAssignments(employeeId);
  }

  @Post('assignments/:id/view')
  async markAsViewed(@Param('id') assignmentId: string) {
    await this.regulationService.markAsViewed(assignmentId);
    return { success: true };
  }

  @Post('assignments/:id/sign')
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
  async refuseRegulation(
    @Param('id') assignmentId: string,
    @Body() body: { reason: string },
  ) {
    return this.regulationService.refuseRegulation(assignmentId, body.reason);
  }
 

  @Get('verify/:code')
  async verifySignature(@Param('code') code: string) {
    return this.regulationService.verifySignature(code);
  }
}
