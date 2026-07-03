import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';

@UseGuards(PermissionGuard)
@Controller('core/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** Historique des modifications d'une entité (RBAC : audit.read). */
  @Get(':entityType/:entityId')
  @RequirePermission(['hr.audit.read', 'core.audit.read'])
  async getEntityHistory(
    @Req() req: any,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const orgId = req?.tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    return this.auditService.getEntityHistory(orgId, entityType, entityId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /** Activité d'un acteur sur une période (RBAC : core.audit.read). */
  @Get('actor/:userId')
  @RequirePermission('core.audit.read')
  async getActorActivity(
    @Req() req: any,
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = req?.tenant?.id;
    if (!orgId) throw new BadRequestException('Tenant non résolu');

    return this.auditService.getActorActivity(orgId, userId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
