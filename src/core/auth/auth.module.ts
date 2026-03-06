import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { LoginHistory } from '../users/login-history.entity';
import { FirebaseAuthGuard } from './firebase-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User, LoginHistory])],
  providers: [FirebaseAuthGuard],
  exports: [FirebaseAuthGuard],
})
export class AuthModule {}
