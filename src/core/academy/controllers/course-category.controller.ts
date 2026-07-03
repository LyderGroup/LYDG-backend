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
  Req,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { CourseCategoryService } from '../services/course-category.service';
import { CreateCourseCategoryDto, UpdateCourseCategoryDto } from '../dto/course-category.dto';
import { ACADEMY_MODULE_CODE, ACADEMY_PERMISSIONS } from '../academy.permissions';

@UseGuards(PermissionGuard)
@Controller('core/academy/categories')
export class CourseCategoryController {
  constructor(private readonly service: CourseCategoryService) {}

  @Get()
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_CATEGORIES_READ, { moduleCode: ACADEMY_MODULE_CODE })
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findAll(tenant?.id as string);
  }

  @Post()
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_CATEGORIES_CREATE, { moduleCode: ACADEMY_MODULE_CODE })
  async create(@Req() req: any, @Body() dto: CreateCourseCategoryDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.create(tenant?.id as string, dto);
  }

  @Patch(':id')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_CATEGORIES_UPDATE, { moduleCode: ACADEMY_MODULE_CODE })
  async update(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCourseCategoryDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_CATEGORIES_DELETE, { moduleCode: ACADEMY_MODULE_CODE })
  async remove(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    await this.service.softDelete(tenant?.id as string, id);
  }
}
