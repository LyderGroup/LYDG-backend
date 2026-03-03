import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacModule } from '../rbac/rbac.module';
import { Notification } from './notification.entity';
import { FcmToken } from './fcm-token.entity';
import { InAppNotificationService } from './in-app-notification.service';
import { FcmService } from './fcm.service';
import { NotificationController } from './notification.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, FcmToken]),
    RbacModule,
  ],
  providers: [InAppNotificationService, FcmService],
  controllers: [NotificationController],
  exports: [InAppNotificationService, FcmService],
})
export class NotificationModule {}
