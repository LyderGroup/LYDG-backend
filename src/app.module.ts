import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrganizationsModule } from './core/organizations/organizations.module';
import { UsersModule } from './core/users/users.module';
import { DepartmentsModule } from './core/departments/departments.module';
import { RbacModule } from './core/rbac/rbac.module';
import { TenantMiddleware } from './core/multi-tenant/tenant.middleware';
import { Organization } from './core/organizations/organizations.entity';
import { AuthModule } from "./core/auth/auth.module";
import { ModulesModule } from './core/modules/modules.module';
import { PilotageModule } from './core/pilotage/pilotage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST') || 'localhost',
        port: parseInt(configService.get<string>('DB_PORT') ?? '5432', 10),
        username: configService.get<string>('DB_USER') || 'postgres',
        password: configService.get<string>('DB_PASSWORD') || 'postgres',
        database: configService.get<string>('DB_NAME') || 'crm_interne',
        autoLoadEntities: true,
        synchronize: false,
        logging: configService.get<string>('NODE_ENV') !== 'production',
      }),
    }),

    TypeOrmModule.forFeature([Organization]),

    OrganizationsModule,
    UsersModule,
    DepartmentsModule,
    ModulesModule,
    PilotageModule,
    RbacModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, TenantMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: 'core/*', method: RequestMethod.ALL });
  }
}
