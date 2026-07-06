import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { LoginHistory } from '../users/login-history.entity';
import { Employee } from '../hr/employee.entity';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { UserDevice } from './user-device.entity';
import { UserDeviceService } from './user-device.service';
import { UserDeviceController } from './user-device.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, LoginHistory, Employee, UserDevice]),
    // RbacModule expose PermissionGuard utilisé par UserDeviceController.
    // NotificationModule est @Global → InAppNotificationService et FcmService
    // sont disponibles automatiquement pour UserDeviceService.
    forwardRef(() => RbacModule),
  ],
  controllers: [UserDeviceController],
  providers: [FirebaseAuthGuard, UserDeviceService],
  exports: [FirebaseAuthGuard, UserDeviceService],
})
export class AuthModule { }
