import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { IsOptional, IsString, IsEnum, IsDateString, IsBoolean, IsArray, IsInt, IsNumber } from 'class-validator';
import { InternalEventService, CreateInternalEventInput, UpdateInternalEventInput } from '../services/internal-event.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';
import type { InternalEventType, InternalEventStatus } from '../entities/internal-event.entity';

// DTOs
class CreateInternalEventDto {
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsEnum(['MEETING', 'TRAINING', 'CELEBRATION', 'ANNOUNCEMENT', 'TEAM_BUILDING', 'BIRTHDAY', 'WORK_ANNIVERSARY', 'HOLIDAY', 'OTHER']) eventType!: InternalEventType;
  @IsOptional() @IsEnum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']) status?: InternalEventStatus;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsBoolean() isAllDay?: boolean;
  @IsOptional() @IsString() location?: string | null;
  @IsOptional() @IsBoolean() isRemote?: boolean;
  @IsOptional() @IsString() organizerId?: string | null;
  @IsOptional() @IsArray() targetDepartments?: string[];
  @IsOptional() @IsArray() targetEmployeeIds?: string[];
  @IsOptional() @IsBoolean() isCompanyWide?: boolean;
  @IsOptional() @IsEnum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']) recurrenceType?: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | null;
  @IsOptional() @IsDateString() recurrenceEndDate?: string | null;
  @IsOptional() @IsBoolean() isVisible?: boolean;
  @IsOptional() @IsBoolean() requiresRsvp?: boolean;
  @IsOptional() @IsArray() attachments?: Array<{ name: string; url: string; type: string }>;
  @IsOptional() @IsString() color?: string;
}

class UpdateInternalEventDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsEnum(['MEETING', 'TRAINING', 'CELEBRATION', 'ANNOUNCEMENT', 'TEAM_BUILDING', 'BIRTHDAY', 'WORK_ANNIVERSARY', 'HOLIDAY', 'OTHER']) eventType?: InternalEventType;
  @IsOptional() @IsEnum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']) status?: InternalEventStatus;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsBoolean() isAllDay?: boolean;
  @IsOptional() @IsString() location?: string | null;
  @IsOptional() @IsBoolean() isRemote?: boolean;
  @IsOptional() @IsString() organizerId?: string | null;
  @IsOptional() @IsArray() targetDepartments?: string[];
  @IsOptional() @IsArray() targetEmployeeIds?: string[];
  @IsOptional() @IsBoolean() isCompanyWide?: boolean;
  @IsOptional() @IsEnum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']) recurrenceType?: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | null;
  @IsOptional() @IsDateString() recurrenceEndDate?: string | null;
  @IsOptional() @IsBoolean() isVisible?: boolean;
  @IsOptional() @IsBoolean() requiresRsvp?: boolean;
  @IsOptional() @IsArray() attachments?: Array<{ name: string; url: string; type: string }>;
  @IsOptional() @IsString() color?: string;
}

class EventFilterDto {
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsEnum(['MEETING', 'TRAINING', 'CELEBRATION', 'ANNOUNCEMENT', 'TEAM_BUILDING', 'BIRTHDAY', 'WORK_ANNIVERSARY', 'HOLIDAY', 'OTHER']) eventType?: InternalEventType;
  @IsOptional() @IsEnum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']) status?: InternalEventStatus;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() organizerId?: string;
  @IsOptional() @IsBoolean() isCompanyWide?: boolean;
  @IsOptional() @IsInt() page?: number;
  @IsOptional() @IsInt() limit?: number;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/internal-events')
export class InternalEventController {
  constructor(private readonly eventService: InternalEventService) { }

  /**
   * Lister les événements avec filtres
   * Permission: HR_INTERNAL_LIFE_READ
   */
  @Get()
  @RequirePermission([HR_PERMISSIONS.HR_INTERNAL_LIFE_READ, HR_PERMISSIONS.HR_INTERNAL_LIFE_READ_OWN], { moduleCode: 'module_c_rh' })
  async listEvents(@Req() req: any, @Query() filters: EventFilterDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.eventService.listEvents(organizationId, {
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      eventType: filters.eventType,
      status: filters.status,
      departmentId: filters.departmentId,
      organizerId: filters.organizerId,
      isCompanyWide: filters.isCompanyWide,
      page: filters.page,
      limit: filters.limit,
    });
  }

  /**
   * Récupérer les événements RH à venir (contrats, anniversaires)
   */
  @Get('upcoming-rh')
  @RequirePermission([HR_PERMISSIONS.HR_INTERNAL_LIFE_READ, HR_PERMISSIONS.HR_INTERNAL_LIFE_READ_OWN], { moduleCode: 'module_c_rh' })
  async getUpcomingRhEvents(@Req() req: any, @Query('days') days?: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    const daysAhead = days ? parseInt(days, 10) : 30;
    return this.eventService.getUpcomingRhEvents(organizationId, daysAhead);
  }

  /**
   * Récupérer les types d'événements disponibles
   */
  @Get('types')
  @RequirePermission([HR_PERMISSIONS.HR_INTERNAL_LIFE_READ, HR_PERMISSIONS.HR_INTERNAL_LIFE_READ_OWN], { moduleCode: 'module_c_rh' })
  getEventTypes() {
    return this.eventService.getEventTypes();
  }

  /**
   * Récupérer les événements d'un mois pour le calendrier
   * Permission: HR_INTERNAL_LIFE_READ
   */
  @Get('calendar/:year/:month')
  @RequirePermission([HR_PERMISSIONS.HR_INTERNAL_LIFE_READ, HR_PERMISSIONS.HR_INTERNAL_LIFE_READ_OWN], { moduleCode: 'module_c_rh' })
  async getCalendarEvents(
    @Req() req: any,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @Query('departmentId') departmentId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.eventService.getCalendarEvents(organizationId, year, month, departmentId, employeeId);
  }

  /**
   * Récupérer les événements à venir
   * Permission: HR_INTERNAL_LIFE_READ
   */
  @Get('upcoming')
  @RequirePermission([HR_PERMISSIONS.HR_INTERNAL_LIFE_READ, HR_PERMISSIONS.HR_INTERNAL_LIFE_READ_OWN], { moduleCode: 'module_c_rh' })
  async getUpcomingEvents(
    @Req() req: any,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('departmentId') departmentId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.eventService.getUpcomingEvents(organizationId, limit || 10, departmentId, employeeId);
  }

  /**
   * Récupérer un événement par ID
   * Permission: HR_INTERNAL_LIFE_READ
   */
  @Get(':id')
  @RequirePermission([HR_PERMISSIONS.HR_INTERNAL_LIFE_READ, HR_PERMISSIONS.HR_INTERNAL_LIFE_READ_OWN], { moduleCode: 'module_c_rh' })
  async getEventById(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.eventService.getEventById(id, organizationId);
  }

  /**
   * Créer un nouvel événement
   * Permission: HR_INTERNAL_LIFE_WRITE
   */
  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_INTERNAL_LIFE_WRITE, { moduleCode: 'module_c_rh' })
  async createEvent(@Req() req: any, @Body() dto: CreateInternalEventDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    const input: CreateInternalEventInput = {
      title: dto.title,
      description: dto.description,
      eventType: dto.eventType,
      status: dto.status,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      isAllDay: dto.isAllDay,
      location: dto.location,
      isRemote: dto.isRemote,
      organizerId: dto.organizerId || req.user?.id,
      targetDepartments: dto.targetDepartments,
      targetEmployeeIds: dto.targetEmployeeIds,
      isCompanyWide: dto.isCompanyWide,
      recurrenceType: dto.recurrenceType,
      recurrenceEndDate: dto.recurrenceEndDate ? new Date(dto.recurrenceEndDate) : null,
      isVisible: dto.isVisible,
      requiresRsvp: dto.requiresRsvp,
      attachments: dto.attachments,
      color: dto.color,
    };

    return this.eventService.createEvent(organizationId, input);
  }

  /**
   * Mettre à jour un événement
   * Permission: HR_INTERNAL_LIFE_WRITE
   */
  @Patch(':id')
  @RequirePermission(HR_PERMISSIONS.HR_INTERNAL_LIFE_WRITE, { moduleCode: 'module_c_rh' })
  async updateEvent(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateInternalEventDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    const input: UpdateInternalEventInput = {
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      recurrenceEndDate: dto.recurrenceEndDate ? new Date(dto.recurrenceEndDate) : undefined,
    };

    return this.eventService.updateEvent(id, organizationId, input);
  }

  /**
   * Supprimer un événement
   * Permission: HR_INTERNAL_LIFE_MANAGE
   */
  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_INTERNAL_LIFE_MANAGE, { moduleCode: 'module_c_rh' })
  async deleteEvent(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.eventService.deleteEvent(id, organizationId);
  }

  /**
   * Publier un événement
   * Permission: HR_INTERNAL_LIFE_MANAGE
   */
  @Post(':id/publish')
  @RequirePermission(HR_PERMISSIONS.HR_INTERNAL_LIFE_MANAGE, { moduleCode: 'module_c_rh' })
  async publishEvent(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.eventService.publishEvent(id, organizationId);
  }

  /**
   * Annuler un événement
   * Permission: HR_INTERNAL_LIFE_MANAGE
   */
  @Post(':id/cancel')
  @RequirePermission(HR_PERMISSIONS.HR_INTERNAL_LIFE_MANAGE, { moduleCode: 'module_c_rh' })
  async cancelEvent(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.eventService.cancelEvent(id, organizationId);
  }

  /**
   * Marquer un événement comme terminé
   * Permission: HR_INTERNAL_LIFE_MANAGE
   */
  @Post(':id/complete')
  @RequirePermission(HR_PERMISSIONS.HR_INTERNAL_LIFE_MANAGE, { moduleCode: 'module_c_rh' })
  async completeEvent(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.eventService.completeEvent(id, organizationId);
  }
}
