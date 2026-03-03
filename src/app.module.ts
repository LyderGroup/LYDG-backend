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
import { ProjectsModule } from './core/projects/projects.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl =
          configService.get<string>('DATABASE_URL') ||
          configService.get<string>('DATABASE_PRIVATE_URL') ||
          configService.get<string>('DATABASE_PUBLIC_URL');
        const useSsl = configService.get<string>('DB_SSL') === 'true';

        const base = {
          type: 'postgres' as const,
          autoLoadEntities: true,
          synchronize: false,
          logging: configService.get<string>('NODE_ENV') !== 'production',
          ssl: useSsl ? ({ rejectUnauthorized: false } as const) : undefined,
        };

        if (databaseUrl) {
          try {
            const parsed = new URL(databaseUrl);
            const normalized = new URL(databaseUrl);
            normalized.hostname = normalized.hostname.toLowerCase();
            const normalizedDatabaseUrl = normalized.toString(); 
            console.log(
              `[db] Using DATABASE_URL host=${normalized.hostname} port=${normalized.port || '5432'} db=${normalized.pathname?.replace('/', '') || ''} ssl=${useSsl}`,
            );
          } catch { 
            console.log(`[db] Using DATABASE_URL (unparseable) ssl=${useSsl}`);
          }

          return {
            ...base,
            url: (() => {
              try {
                const normalized = new URL(databaseUrl);
                normalized.hostname = normalized.hostname.toLowerCase();
                return normalized.toString();
              } catch {
                return databaseUrl;
              }
            })(),
          };
        }

        const host =
          configService.get<string>('DB_HOST') ||
          configService.get<string>('PGHOST') ||
          'localhost';
        const portRaw =
          configService.get<string>('DB_PORT') ??
          configService.get<string>('PGPORT') ??
          '5432';
        const database =
          configService.get<string>('DB_NAME') ||
          configService.get<string>('PGDATABASE') ||
          'lydg'; 
        console.log(`[db] Using params host=${host} port=${portRaw} db=${database} ssl=${useSsl}`);

        return {
          ...base,
          host,
          port: parseInt(portRaw, 10),
          username:
            configService.get<string>('DB_USER') ||
            configService.get<string>('PGUSER') ||
            'postgres',
          password:
            configService.get<string>('DB_PASSWORD') ||
            configService.get<string>('PGPASSWORD') ||
            'crmdatabase',
          database,
        };
      },
    }),

    TypeOrmModule.forFeature([Organization]),

    OrganizationsModule,
    UsersModule,
    DepartmentsModule,
    ModulesModule,
    PilotageModule,
    ProjectsModule,
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
