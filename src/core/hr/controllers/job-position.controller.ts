import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { JobPositionService } from '../services/job-position.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

class CreateJobPositionDto {
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() name?: string | null;
  @IsString() title!: string;
  /** Facultatif : genere a partir du nom s'il n'est pas fourni. */
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() responsibilities?: string | null;
  @IsOptional() @IsBoolean() isTeamLead?: boolean;
  @IsOptional() @IsBoolean() isDepartmentHead?: boolean;
  @IsOptional() @IsBoolean() isProjectLead?: boolean;
  @IsOptional() @IsBoolean() isHrDirector?: boolean;
  @IsOptional() @IsString() jobFamily?: string | null;
  @IsOptional() @IsString() jobLevel?: string | null;
  @IsOptional() @IsString() salaryGrade?: string | null;
  @IsOptional() @IsNumber() minSalary?: number | null;
  @IsOptional() @IsNumber() maxSalary?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateJobPositionDto {
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() name?: string | null;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() responsibilities?: string | null;
  @IsOptional() @IsBoolean() isTeamLead?: boolean;
  @IsOptional() @IsBoolean() isDepartmentHead?: boolean;
  @IsOptional() @IsBoolean() isProjectLead?: boolean;
  @IsOptional() @IsBoolean() isHrDirector?: boolean;
  @IsOptional() @IsString() jobFamily?: string | null;
  @IsOptional() @IsString() jobLevel?: string | null;
  @IsOptional() @IsString() salaryGrade?: string | null;
  @IsOptional() @IsNumber() minSalary?: number | null;
  @IsOptional() @IsNumber() maxSalary?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class SetEmployeePositionsDto {
  @IsArray() @IsUUID('4', { each: true }) positionIds!: string[];
  @IsOptional() @IsUUID('4') primaryPositionId?: string | null;
}

@UseGuards(PermissionGuard)
@Controller('core/hr/job-positions')
export class JobPositionController {
  constructor(private readonly service: JobPositionService) { }

  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, { moduleCode: 'module_c_rh' })
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const page = query.page ? parseInt(query.page as string, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit as string, 10) : undefined;
    const search = typeof query.search === 'string' ? query.search.trim() : undefined;
    const departmentId = typeof query.departmentId === 'string' ? query.departmentId : undefined;
    const isActive = query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;

    return this.service.findPage(tenant?.id as string, { page, limit, search, departmentId, isActive });
  }

  // Routes statiques AVANT `:id`, sinon Nest y verrait un identifiant.

  /** Manager RH de la filiale courante (titulaire du poste DRH), ou null. */
  @Get('hr-director')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, { moduleCode: 'module_c_rh' })
  async hrDirector(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return { hrDirector: await this.service.resolveHrDirector(tenant?.id as string) };
  }

  /** Postes d'un collaborateur : actuels puis historique. */
  @Get('employee/:employeeId')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, { moduleCode: 'module_c_rh' })
  async listForEmployee(
    @Req() req: any,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.listForEmployee(tenant?.id as string, employeeId);
  }

  /** Fixe les postes actuels d'un collaborateur (les retires sont clos). */
  @Put('employee/:employeeId')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_WRITE, { moduleCode: 'module_c_rh' })
  async setForEmployee(
    @Req() req: any,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: SetEmployeePositionsDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    return this.service.setForEmployee(
      tenant?.id as string,
      employeeId,
      dto.positionIds ?? [],
      dto.primaryPositionId ?? null,
      currentUser?.id ?? null,
    );
  }

  @Get(':id')
  @RequirePermission(HR_PERMISSIONS.HR_EMPLOYEES_READ_ALL, { moduleCode: 'module_c_rh' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const item = await this.service.findOne(tenant?.id as string, id);
    if (!item) throw new BadRequestException('Poste non trouvé');
    return item;
  }

  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
  async create(@Req() req: any, @Body() dto: CreateJobPositionDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    if (!dto.title?.trim()) throw new BadRequestException('Le titre est obligatoire');
    return this.service.create(tenant?.id as string, dto);
  }

  @Patch(':id')
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateJobPositionDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, dto);
  }

  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
  async delete(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.delete(tenant?.id as string, id);
  }
}
