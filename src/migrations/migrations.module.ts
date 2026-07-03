import { Module } from '@nestjs/common';
import { MigrationsService } from './migrations.service';
import { MigrationsController } from './migrations.controller';
import { RbacModule } from '../core/rbac/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [MigrationsController],
  providers: [MigrationsService],
})
export class MigrationsModule { }
