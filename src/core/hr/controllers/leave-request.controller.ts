import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString, IsOptional, IsBoolean, IsNumber, IsDateString, IsUUID } from 'class-validator';
import {
  LeaveRequestAttachment,
  LeaveRequestService,
  LeaveRequestUserContext,
} from '../services/leave-request.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';
import {
  buildUploadConfig,
  makeStorageKey,
  MIME_DOCUMENTS,
  MIME_IMAGES,
  MIME_OFFICE,
} from '../../security/multer.config';
import { SupabaseStorageService } from '../../storage/supabase-storage.service';

// Pièces jointes des demandes de congés : PDF + images + DOC, max 10 MB.
const leaveRequestUploadConfig = buildUploadConfig({
  subdir: 'leave-requests',
  allowedMimes: [...MIME_DOCUMENTS, ...MIME_IMAGES, ...MIME_OFFICE],
  maxFileSize: 10 * 1024 * 1024,
});

interface UploadedFileShape {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

class CreateLeaveRequestDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() leaveTypeId?: string;
  @IsOptional() @IsString() leaveTypeCode?: string;
  @IsOptional() @IsString() customTypeName?: string | null;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() startPeriod?: string;
  @IsOptional() @IsString() endPeriod?: string;
  @IsOptional() @IsNumber() totalDays?: number;
  @IsOptional() @IsString() reason?: string | null;
  @IsOptional() @IsString() destination?: string | null;
  @IsOptional() @IsString() emergencyContact?: string | null;
  @IsOptional() @IsUUID() substituteEmployeeId?: string | null;
  @IsOptional() @IsString() handoverNotes?: string | null;
  @IsOptional() @IsBoolean() isJoker?: boolean;
  @IsOptional() @IsBoolean() isPartial?: boolean;
  @IsOptional() @IsString() startTime?: string | null;
  @IsOptional() @IsString() endTime?: string | null;
}

class ApproveLeaveRequestDto {
  @IsOptional() @IsString() notes?: string;
}

class RejectLeaveRequestDto {
  @IsString() reason!: string;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/leave-requests')
export class LeaveRequestController {
  constructor(
    private readonly service: LeaveRequestService,
    private readonly storage: SupabaseStorageService,
  ) { }

  private userContext(req: any): LeaveRequestUserContext {
    const tenant = req.tenant as { id?: string } | undefined;
    return {
      employeeId: req.user?.employeeId,
      permissionCodes: req.permissionCodes || [],
      organizationId: tenant?.id ?? req.user?.organizationId,
    };
  }

  @Get('joker-usage')
  @RequirePermission([HR_PERMISSIONS.HR_LEAVE_READ_OWN, HR_PERMISSIONS.HR_LEAVE_READ_TEAM, HR_PERMISSIONS.HR_LEAVE_READ_ALL], { moduleCode: 'module_c_rh' })
  async getJokerUsage(@Req() req: any) {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      // Cas frontière : utilisateur sans fiche employée. On expose la même
      // structure que getJokerUsage mais sans usage. La source de vérité du
      // maxCount reste le service (impossible de drift entre service et fallback).
      const fallback = await this.service.getJokerUsage('00000000-0000-0000-0000-000000000000');
      return { weekStart: fallback.weekStart, usedCount: 0, maxCount: fallback.maxCount };
    }
    return this.service.getJokerUsage(employeeId);
  }

  @Get()
  @RequirePermission([HR_PERMISSIONS.HR_LEAVE_READ_OWN, HR_PERMISSIONS.HR_LEAVE_READ_TEAM, HR_PERMISSIONS.HR_LEAVE_READ_ALL], { moduleCode: 'module_c_rh' })
  async list(@Req() req: any, @Query() query: any) {
    const ctx = this.userContext(req);
    if (!ctx.organizationId) throw new BadRequestException('Organisation non trouvée');

    let scope: 'own' | 'team' | 'all' = 'own';
    if (ctx.permissionCodes.includes(HR_PERMISSIONS.HR_LEAVE_READ_ALL)) scope = 'all';
    else if (ctx.permissionCodes.includes(HR_PERMISSIONS.HR_LEAVE_READ_TEAM)) scope = 'team';

    return this.service.findPage(ctx.organizationId, {
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      employeeId: ctx.employeeId,
      status: typeof query.status === 'string' ? query.status : undefined,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      scope,
    });
  }

  @Get(':id')
  @RequirePermission([HR_PERMISSIONS.HR_LEAVE_READ_OWN, HR_PERMISSIONS.HR_LEAVE_READ_TEAM, HR_PERMISSIONS.HR_LEAVE_READ_ALL], { moduleCode: 'module_c_rh' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const ctx = this.userContext(req);
    const item = await this.service.findOne(ctx.organizationId, id);
    if (!item) throw new BadRequestException('Demande de congé non trouvée');
    await this.service.assertCanReadLeave(item, ctx);
    return item;
  }

  /**
   * Création d'une demande de congé. Accepte JSON simple OU multipart/form-data
   * avec un fichier `file` (justificatif). Si un fichier est joint, son URL
   * est ajoutée dans `attachments`.
   */
  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_LEAVE_WRITE, { moduleCode: 'module_c_rh' })
  @UseInterceptors(FileInterceptor('file', leaveRequestUploadConfig))
  async create(
    @Req() req: any,
    @Body() rawDto: CreateLeaveRequestDto | Record<string, any>,
    @UploadedFile() file?: UploadedFileShape,
  ) {
    // En multipart, les booléens et nombres arrivent en string : on normalise.
    const dto = this.normalizeDto(rawDto);

    const employeeId = dto.employeeId || req.user?.employeeId;
    if (!employeeId) throw new BadRequestException('L\'employé est obligatoire');
    if (!dto.startDate) throw new BadRequestException('La date de début est obligatoire');

    const attachments: LeaveRequestAttachment[] = [];
    if (file) {
      const key = makeStorageKey('leave-requests', file.originalname);
      await this.storage.upload(key, file.buffer, file.mimetype);
      attachments.push({
        url: `/uploads/${key}`,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      });
    }

    return this.service.createWithCode({
      employeeId,
      organizationId: req.user?.organizationId,
      leaveTypeId: dto.leaveTypeId,
      leaveTypeCode: dto.leaveTypeCode,
      startDate: new Date(dto.startDate),
      endDate: dto.endDate ? new Date(dto.endDate) : new Date(dto.startDate),
      startPeriod: dto.startPeriod,
      endPeriod: dto.endPeriod,
      totalDays: dto.totalDays ?? 1,
      reason: dto.reason ?? null,
      destination: dto.destination ?? null,
      emergencyContact: dto.emergencyContact ?? null,
      substituteEmployeeId: dto.substituteEmployeeId ?? null,
      handoverNotes: dto.handoverNotes ?? null,
      isJoker: dto.isJoker ?? false,
      isPartial: dto.isPartial ?? false,
      startTime: dto.startTime ?? null,
      endTime: dto.endTime ?? null,
      attachments,
    });
  }

  /**
   * Convertit les valeurs string d'un body multipart en booléens/nombres
   * attendus par le service. ValidationPipe ne s'applique pas en multipart
   * de la même manière qu'en JSON.
   */
  private normalizeDto(raw: any): CreateLeaveRequestDto {
    if (!raw || typeof raw !== 'object') return raw;
    const out: any = { ...raw };
    if (typeof out.totalDays === 'string') out.totalDays = parseFloat(out.totalDays);
    if (typeof out.isJoker === 'string') out.isJoker = out.isJoker === 'true';
    if (typeof out.isPartial === 'string') out.isPartial = out.isPartial === 'true';
    return out as CreateLeaveRequestDto;
  }

  @Post(':id/approve')
  @RequirePermission(HR_PERMISSIONS.HR_LEAVE_APPROVE, { moduleCode: 'module_c_rh' })
  async approve(@Req() req: any, @Param('id') id: string, @Body() dto: ApproveLeaveRequestDto) {
    const ctx = this.userContext(req);
    const item = await this.service.findOne(ctx.organizationId, id);
    if (!item) throw new BadRequestException('Demande de congé non trouvée');
    await this.service.assertCanApproveLeave(item, ctx);
    return this.service.approve(ctx.organizationId, id, req.user?.id, dto.notes);
  }

  @Post(':id/reject')
  @RequirePermission(HR_PERMISSIONS.HR_LEAVE_APPROVE, { moduleCode: 'module_c_rh' })
  async reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectLeaveRequestDto) {
    if (!dto.reason?.trim()) throw new BadRequestException('Le motif de rejet est obligatoire');
    const ctx = this.userContext(req);
    const item = await this.service.findOne(ctx.organizationId, id);
    if (!item) throw new BadRequestException('Demande de congé non trouvée');
    await this.service.assertCanApproveLeave(item, ctx);
    return this.service.reject(ctx.organizationId, id, req.user?.id, dto.reason);
  }

  @Post(':id/cancel')
  @RequirePermission(HR_PERMISSIONS.HR_LEAVE_WRITE, { moduleCode: 'module_c_rh' })
  async cancel(@Req() req: any, @Param('id') id: string) {
    const ctx = this.userContext(req);
    const item = await this.service.findOne(ctx.organizationId, id);
    if (!item) throw new BadRequestException('Demande de congé non trouvée');
    this.service.assertCanCancelLeave(item, ctx);
    return this.service.cancel(ctx.organizationId, id);
  }

  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_LEAVE_APPROVE, { moduleCode: 'module_c_rh' })
  async delete(@Req() req: any, @Param('id') id: string) {
    const ctx = this.userContext(req);
    return this.service.delete(ctx.organizationId, id);
  }
}
