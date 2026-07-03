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
import { EnrollmentService } from '../services/enrollment.service';
import { CreateEnrollmentDto, UpdateEnrollmentDto } from '../dto/enrollment.dto';
import { ACADEMY_MODULE_CODE, ACADEMY_PERMISSIONS } from '../academy.permissions';
import { EnrollmentStatus } from '../entities/course-enrollment.entity';

const STATUSES: EnrollmentStatus[] = ['invited', 'enrolled', 'in_progress', 'completed', 'cancelled', 'failed'];

@UseGuards(PermissionGuard)
@Controller('core/academy/enrollments')
export class EnrollmentController {
  constructor(private readonly service: EnrollmentService) {}

  @Get()
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_ENROLLMENTS_READ, { moduleCode: ACADEMY_MODULE_CODE })
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findPage(tenant?.id as string, {
      page: query.page ? parseInt(query.page as string, 10) : undefined,
      limit: query.limit ? parseInt(query.limit as string, 10) : undefined,
      search: typeof query.search === 'string' ? query.search.trim() : undefined,
      status: STATUSES.includes(query.status) ? (query.status as EnrollmentStatus) : undefined,
      courseId: typeof query.courseId === 'string' ? query.courseId : undefined,
      employeeId: typeof query.employeeId === 'string' ? query.employeeId : undefined,
    });
  }

  @Get(':id')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_ENROLLMENTS_READ, { moduleCode: ACADEMY_MODULE_CODE })
  async findOne(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findOne(tenant?.id as string, id);
  }

  @Post()
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_ENROLLMENTS_CREATE, { moduleCode: ACADEMY_MODULE_CODE })
  async create(@Req() req: any, @Body() dto: CreateEnrollmentDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.create(tenant?.id as string, user?.id ?? null, dto);
  }

  @Patch(':id')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_ENROLLMENTS_UPDATE, { moduleCode: ACADEMY_MODULE_CODE })
  async update(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEnrollmentDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, user?.id ?? null, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_ENROLLMENTS_MANAGE, { moduleCode: ACADEMY_MODULE_CODE })
  async remove(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    await this.service.softDelete(tenant?.id as string, id, user?.id ?? null);
  }
}
