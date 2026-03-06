import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacModule } from '../rbac/rbac.module';
import { Organization } from '../organizations/organizations.entity';
import { User } from '../users/user.entity';
import { Notification } from './notification.entity';
import { FcmToken } from './fcm-token.entity';
import { InAppNotificationService } from './in-app-notification.service';
import { FcmService } from './fcm.service';
import { NotificationController } from './notification.controller';
import { NotificationsRealtimeService } from './notifications.realtime';
import { NotificationListener } from './notification.listener';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, FcmToken, Organization, User]),
    RbacModule,
  ],
  providers: [
    InAppNotificationService,
    FcmService,
    NotificationsRealtimeService,
    NotificationListener,
  ],
  controllers: [NotificationController],
  exports: [InAppNotificationService, FcmService, NotificationsRealtimeService],
})
export class NotificationModule { }
