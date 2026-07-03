import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../rbac/permission.guard';
import { UserDeviceService } from './user-device.service';

/**
 * Endpoints de gestion des appareils par l'utilisateur connecté.
 * Pas de permission RBAC particulière requise : un user peut voir/révoquer
 * uniquement ses propres devices (filtré par userId).
 */
@Controller('core/auth/my-devices')
@UseGuards(PermissionGuard)
export class UserDeviceController {
  constructor(private readonly devices: UserDeviceService) {}

  @Get()
  async listMyDevices(@Req() req: any) {
    const userId = req.user?.id as string | undefined;
    if (!userId) throw new UnauthorizedException('Missing authenticated user');
    return this.devices.listForUser(userId);
  }

  @Delete(':id')
  async revokeMyDevice(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = req.user?.id as string | undefined;
    if (!userId) throw new UnauthorizedException('Missing authenticated user');
    await this.devices.revokeForUser(userId, id);
    return { revoked: true };
  }
}
