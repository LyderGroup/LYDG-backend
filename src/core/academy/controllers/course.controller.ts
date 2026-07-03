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
import { CourseService } from '../services/course.service';
import { CreateCourseDto, UpdateCourseDto } from '../dto/course.dto';
import { ACADEMY_MODULE_CODE, ACADEMY_PERMISSIONS } from '../academy.permissions';
import { CourseStatus } from '../entities/course.entity';

const STATUSES: CourseStatus[] = ['draft', 'published', 'archived'];

@UseGuards(PermissionGuard)
@Controller('core/academy/courses')
export class CourseController {
  constructor(private readonly service: CourseService) {}

  @Get()
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_COURSES_READ, { moduleCode: ACADEMY_MODULE_CODE })
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findPage(tenant?.id as string, {
      page: query.page ? parseInt(query.page as string, 10) : undefined,
      limit: query.limit ? parseInt(query.limit as string, 10) : undefined,
      search: typeof query.search === 'string' ? query.search.trim() : undefined,
      status: STATUSES.includes(query.status) ? (query.status as CourseStatus) : undefined,
      categoryId: typeof query.categoryId === 'string' ? query.categoryId : undefined,
    });
  }

  @Get(':id')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_COURSES_READ, { moduleCode: ACADEMY_MODULE_CODE })
  async findOne(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findOne(tenant?.id as string, id);
  }

  @Post()
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_COURSES_CREATE, { moduleCode: ACADEMY_MODULE_CODE })
  async create(@Req() req: any, @Body() dto: CreateCourseDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.create(tenant?.id as string, user?.id ?? null, dto);
  }

  @Patch(':id')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_COURSES_UPDATE, { moduleCode: ACADEMY_MODULE_CODE })
  async update(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, user?.id ?? null, dto);
  }

  @Post(':id/publish')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_COURSES_PUBLISH, { moduleCode: ACADEMY_MODULE_CODE })
  async publish(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.publish(tenant?.id as string, id, user?.id ?? null);
  }

  @Post(':id/archive')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_COURSES_PUBLISH, { moduleCode: ACADEMY_MODULE_CODE })
  async archive(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.archive(tenant?.id as string, id, user?.id ?? null);
  }

  @Post(':id/unarchive')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_COURSES_PUBLISH, { moduleCode: ACADEMY_MODULE_CODE })
  async unarchive(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.unarchive(tenant?.id as string, id, user?.id ?? null);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_COURSES_DELETE, { moduleCode: ACADEMY_MODULE_CODE })
  async remove(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    await this.service.softDelete(tenant?.id as string, id, user?.id ?? null);
  }
}
