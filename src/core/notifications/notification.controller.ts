import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { InAppNotificationService } from './in-app-notification.service';
import { FcmService } from './fcm.service';

@Controller('core/notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: InAppNotificationService,
    private readonly fcmService: FcmService,
  ) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission([], { moduleCode: 'core' })
  async getMyNotifications(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.notificationService.getForUser(
      String(currentUser.id),
      String(tenant.id),
      { limit: 50 },
    );
  }

  @Get('unread-count')
  @UseGuards(PermissionGuard)
  @RequirePermission([], { moduleCode: 'core' })
  async getUnreadCount(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const { unreadCount } = await this.notificationService.getForUser(
      String(currentUser.id),
      String(tenant.id),
      { unreadOnly: true },
    );

    return { unreadCount };
  }

  @Post(':id/read')
  @UseGuards(PermissionGuard)
  @RequirePermission([], { moduleCode: 'core' })
  async markAsRead(@Req() req: any, @Param('id') notificationId: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    await this.notificationService.markAsRead(
      notificationId,
      String(currentUser.id),
      String(tenant.id),
    );

    return { success: true };
  }

  @Post('read-all')
  @UseGuards(PermissionGuard)
  @RequirePermission([], { moduleCode: 'core' })
  async markAllAsRead(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    await this.notificationService.markAllAsRead(
      String(currentUser.id),
      String(tenant.id),
    );

    return { success: true };
  } 

  @Post('fcm-token')
  @UseGuards(PermissionGuard)
  @RequirePermission([], { moduleCode: 'core' })
  async registerFcmToken(
    @Req() req: any,
    @Body() body: { token: string; deviceType?: string; deviceId?: string },
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!body.token) {
      throw new BadRequestException('FCM token is required');
    }

    const fcmToken = await this.fcmService.registerToken(
      String(currentUser.id),
      String(tenant.id),
      body.token,
      body.deviceType,
      body.deviceId,
    );

    return { success: true, id: fcmToken.id };
  }

  @Post('fcm/unregister')
  @UseGuards(PermissionGuard)
  @RequirePermission([], { moduleCode: 'core' })
  async unregisterFcmToken(@Req() req: any, @Body() body: { token: string }) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!body.token) {
      throw new BadRequestException('FCM token is required');
    }

    await this.fcmService.deactivateToken(body.token);

    return { success: true };
  }
}
