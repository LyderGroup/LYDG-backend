import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { ACADEMY_MODULE_CODE, ACADEMY_PERMISSIONS } from '../academy.permissions';
import { CourseService } from '../services/course.service';
import { CourseSessionService } from '../services/course-session.service';

/**
 * Endpoints orientés apprenant — exposent uniquement le contenu publié /
 * les sessions ouvertes. Lecture seule. Permission minimale :
 * `academy.courses.read` (qu'on suppose détenue par les apprenants).
 */
@UseGuards(PermissionGuard)
@Controller('core/academy/catalog')
export class CatalogController {
  constructor(
    private readonly courses: CourseService,
    private readonly sessions: CourseSessionService,
  ) {}

  @Get('courses')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_COURSES_READ, { moduleCode: ACADEMY_MODULE_CODE })
  async listPublishedCourses(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.courses.findPage(tenant?.id as string, {
      page: query.page ? parseInt(query.page as string, 10) : undefined,
      limit: query.limit ? parseInt(query.limit as string, 10) : undefined,
      search: typeof query.search === 'string' ? query.search.trim() : undefined,
      status: 'published',
      categoryId: typeof query.categoryId === 'string' ? query.categoryId : undefined,
    });
  }

  @Get('sessions')
  @RequirePermission(ACADEMY_PERMISSIONS.ACADEMY_COURSES_READ, { moduleCode: ACADEMY_MODULE_CODE })
  async listOpenSessions(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    // Catalogue apprenant : statut dérivé des dates → on expose toute session
    // inscriptible (non annulée, non terminée = planifiée ou en cours).
    return this.sessions.findPage(tenant?.id as string, {
      page: query.page ? parseInt(query.page as string, 10) : undefined,
      limit: query.limit ? parseInt(query.limit as string, 10) : undefined,
      search: typeof query.search === 'string' ? query.search.trim() : undefined,
      enrollableOnly: true,
      courseId: typeof query.courseId === 'string' ? query.courseId : undefined,
    });
  }
}
