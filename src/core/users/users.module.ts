import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { LoginHistory } from './login-history.entity';
import { UserRole } from '../rbac/user-role.entity';
import { Role } from '../rbac/role.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, LoginHistory, UserRole, Role]), RbacModule, NotificationModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule { }
