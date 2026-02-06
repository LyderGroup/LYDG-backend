import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { FirebaseAuthGuard } from './firebase-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [FirebaseAuthGuard],
  exports: [FirebaseAuthGuard],
})
export class AuthModule {}
