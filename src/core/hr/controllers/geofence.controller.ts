import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { CreateGeofenceInput, UpdateGeofenceInput } from '../services/geofence.service';
import { GeofenceService } from '../services/geofence.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';

@Controller('core/hr/geofence')
@UseGuards(PermissionGuard)
export class GeofenceController {
  constructor(private readonly geofenceService: GeofenceService) { }
  
  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
  async createZone(
    @Req() req: any,
    
    @Body() input: CreateGeofenceInput,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.geofenceService.createZone(
      organizationId as string,
      input,
      currentUser?.id ?? null,
      
    );
  }

  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_ALL, { moduleCode: 'module_c_rh' })
  async listZones(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.geofenceService.listZones(organizationId as string);
  }

  @Get('default')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_OWN, { moduleCode: 'module_c_rh' })
  async getDefaultZone(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.geofenceService.getDefaultZone(organizationId as string);
  }

  @Post('check')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_WRITE, { moduleCode: 'module_c_rh' })
  async checkLocation(
    @Req() req: any,
    @Body() body: { latitude: number; longitude: number },
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.geofenceService.checkLocation(organizationId as string, body);
  }
  @Get(':id')
  @RequirePermission(HR_PERMISSIONS.HR_ATTENDANCE_READ_ALL, { moduleCode: 'module_c_rh' })
  async getZone(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.geofenceService.getZone(organizationId as string, id);
  }

  @Put(':id')
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
  async updateZone(
    @Req() req: any,
    @Param('id') id: string,
    @Body() input: UpdateGeofenceInput,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.geofenceService.updateZone(organizationId as string, id, input);
  }


  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
  async deleteZone(@Req() req: any, @Param('id') id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const organizationId = tenant?.id ?? req.user?.organizationId;

    return this.geofenceService.deleteZone(organizationId as string, id);
  }
}
