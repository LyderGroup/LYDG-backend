import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { ACADEMY_MODULE_CODE, ACADEMY_PERMISSIONS } from '../academy.permissions';
import { EnrollmentService } from '../services/enrollment.service';

class SelfEnrollDto {
  @IsOptional() @IsUUID() courseId?: string;
  @IsOptional() @IsUUID() sessionId?: string;
}

/**
 * Endpoints orientés apprenant — gestion de ses propres inscriptions.
 */
@UseGuards(PermissionGuard)
@Controller('core/academy/my')
export class MyEnrollmentsController {
  constructor(private readonly enrollments: EnrollmentService) {}

  @Get('enrollments')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_ENROLLMENTS_READ_OWN, { moduleCode: ACADEMY_MODULE_CODE })
  async listMine(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string; employeeId?: string } | undefined;
    return this.enrollments.findMine(tenant?.id as string, {
      employeeId: user?.employeeId ?? null,
      userId: user?.id ?? null,
    });
  }

  @Post('enrollments')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_ENROLLMENTS_CREATE, { moduleCode: ACADEMY_MODULE_CODE })
  async selfEnroll(@Req() req: any, @Body() dto: SelfEnrollDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string; employeeId?: string } | undefined;
    return this.enrollments.selfEnroll(
      tenant?.id as string,
      { employeeId: user?.employeeId ?? null, userId: user?.id ?? null },
      { courseId: dto.courseId ?? null, sessionId: dto.sessionId ?? null },
    );
  }

  /**
   * Bouton "Terminé" : l'apprenant marque SA propre inscription comme complétée.
   * Le service vérifie que l'inscription lui appartient.
   */
  @Post('enrollments/:id/complete')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_ENROLLMENTS_READ_OWN, { moduleCode: ACADEMY_MODULE_CODE })
  async completeMine(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string; employeeId?: string } | undefined;
    return this.enrollments.completeMine(
      tenant?.id as string,
      { employeeId: user?.employeeId ?? null, userId: user?.id ?? null },
      id,
    );
  }
}
