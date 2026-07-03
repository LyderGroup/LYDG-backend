import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { CourseSessionService } from '../services/course-session.service';
import { CreateCourseSessionDto, UpdateCourseSessionDto } from '../dto/course-session.dto';
import { ACADEMY_MODULE_CODE, ACADEMY_PERMISSIONS } from '../academy.permissions';
import { SessionStatus } from '../entities/course-session.entity';

const STATUSES: SessionStatus[] = ['planned', 'open', 'in_progress', 'completed', 'cancelled'];

@UseGuards(PermissionGuard)
@Controller('core/academy/sessions')
export class CourseSessionController {
  constructor(private readonly service: CourseSessionService) {}

  @Get()
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_SESSIONS_READ, { moduleCode: ACADEMY_MODULE_CODE })
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findPage(tenant?.id as string, {
      page: query.page ? parseInt(query.page as string, 10) : undefined,
      limit: query.limit ? parseInt(query.limit as string, 10) : undefined,
      search: typeof query.search === 'string' ? query.search.trim() : undefined,
      status: STATUSES.includes(query.status) ? (query.status as SessionStatus) : undefined,
      courseId: typeof query.courseId === 'string' ? query.courseId : undefined,
    });
  }

  @Get(':id')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_SESSIONS_READ, { moduleCode: ACADEMY_MODULE_CODE })
  async findOne(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findOne(tenant?.id as string, id);
  }

  @Post()
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_SESSIONS_CREATE, { moduleCode: ACADEMY_MODULE_CODE })
  async create(@Req() req: any, @Body() dto: CreateCourseSessionDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.create(tenant?.id as string, user?.id ?? null, {
      title: dto.title,
      description: dto.description ?? null,
      courseId: dto.courseId ?? null,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      location: dto.location ?? null,
      instructor: dto.instructor ?? null,
      costPerParticipant: dto.costPerParticipant ?? null,
      currency: dto.currency ?? 'XOF',
    });
  }

  @Patch(':id')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_SESSIONS_UPDATE, { moduleCode: ACADEMY_MODULE_CODE })
  async update(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCourseSessionDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, {
      title: dto.title,
      description: dto.description,
      courseId: dto.courseId,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      location: dto.location,
      instructor: dto.instructor,
      costPerParticipant: dto.costPerParticipant,
      currency: dto.currency,
      status: dto.status as SessionStatus | undefined,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_SESSIONS_DELETE, { moduleCode: ACADEMY_MODULE_CODE })
  async delete(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    await this.service.softDelete(tenant?.id as string, id);
  }
}
