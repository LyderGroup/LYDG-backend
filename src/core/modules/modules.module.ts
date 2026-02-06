import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacModule } from '../rbac/rbac.module';
import { CoreModule } from './module.entity';
import { OrganizationModule } from './organization-module.entity';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';

@Module({
  imports: [TypeOrmModule.forFeature([CoreModule, OrganizationModule]), RbacModule],
  controllers: [ModulesController],
  providers: [ModulesService],
  exports: [ModulesService],
})
export class ModulesModule {}
