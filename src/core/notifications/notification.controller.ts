import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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

  @Patch(':id/read')
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

  /**
   * Envoie une notification de test (in-app + FCM Web Push) à l'utilisateur
   * authentifié lui-même. Permet de vérifier en un clic que la chaîne
   * complète fonctionne sans avoir à déclencher un événement métier réel
   * (feedback, validation, etc.).
   */
  @Post('test-push')
  @UseGuards(PermissionGuard)
  @RequirePermission([], { moduleCode: 'core' })
  async sendTestPush(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const title = 'Test de notification';
    const body = `Si vous voyez ceci, la chaîne in-app + FCM fonctionne. (${new Date().toLocaleTimeString('fr-FR')})`;
    const data = {
      type: 'test_push',
      sentAt: new Date().toISOString(),
    };

    await this.notificationService
      .create({
        userId: String(currentUser.id),
        organizationId: String(tenant.id),
        type: 'test_push',
        title,
        message: body,
        data,
      })
      .catch(() => null);

    const pushCount = await this.fcmService.sendToUser(
      String(currentUser.id),
      title,
      body,
      data,
    );

    return {
      success: true,
      inAppCreated: true,
      pushSent: pushCount,
    };
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
    return this.deactivateFcmToken(req, body);
  }

  /**
   * Alias DELETE /core/notifications/fcm-token pour symétrie avec POST.
   * Le frontend appelait DELETE auparavant — la route n'existait pas.
   */
  @Delete('fcm-token')
  @UseGuards(PermissionGuard)
  @RequirePermission([], { moduleCode: 'core' })
  async deleteFcmToken(@Req() req: any, @Body() body: { token: string }) {
    return this.deactivateFcmToken(req, body);
  }

  private async deactivateFcmToken(req: any, body: { token: string }) {
    const tenant = req.tenant as { id?: string } | undefined;
    const currentUser = req.user as { id?: string } | undefined;

    if (!tenant?.id) {
      throw new BadRequestException('Missing tenant context');
    }
    if (!currentUser?.id) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    if (!body?.token) {
      throw new BadRequestException('FCM token is required');
    }

    await this.fcmService.deactivateToken(body.token);
    return { success: true };
  }
}
