import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrganizationsModule } from './core/organizations/organizations.module';
import { UsersModule } from './core/users/users.module';
import { DepartmentsModule } from './core/departments/departments.module';
import { RbacModule } from './core/rbac/rbac.module';
import { TenantMiddleware } from './core/multi-tenant/tenant.middleware';
import { Organization } from './core/organizations/organizations.entity';
import { AuthModule } from "./core/auth/auth.module";
import { FirebaseAuthGuard } from './core/auth/firebase-auth.guard';
import { ModulesModule } from './core/modules/modules.module';
import { PilotageModule } from './core/pilotage/pilotage.module';
import { ProjectsModule } from './core/projects/projects.module';
import { HrModule } from './core/hr/hr.module';
import { FinanceModule } from './core/finance/finance.module';
import { AcademyModule } from './core/academy/academy.module';
import { DocumentsModule } from './core/documents/documents.module';
import { MigrationsModule } from './migrations/migrations.module';
import { DevModule } from './dev/dev.module';
import { AuditModule } from './core/audit/audit.module';
import { StorageModule } from './core/storage/storage.module';
import { PublicModule } from './public/public.module';

/**
 * Construit la configuration SSL pour la connexion PostgreSQL.
 * - En prod : exige un CA explicite (DB_CA_CERT en PEM ou DB_CA_CERT_BASE64).
 * - En dev : autorise rejectUnauthorized:false en l'absence de CA.
 */
function buildSslConfig(configService: ConfigService, isProd: boolean) {
  const caRaw = configService.get<string>('DB_CA_CERT');
  const caB64 = configService.get<string>('DB_CA_CERT_BASE64');
  let ca: string | undefined;
  if (caRaw && caRaw.trim().length > 0) {
    ca = caRaw;
  } else if (caB64 && caB64.trim().length > 0) {
    ca = Buffer.from(caB64, 'base64').toString('utf8');
  }
  if (ca) {
    return { ca, rejectUnauthorized: true } as const;
  }
  if (isProd) {
    console.warn(
      '[db] SSL activé sans CA en production : connexion exposée au MITM. ' +
        'Définissez DB_CA_CERT ou DB_CA_CERT_BASE64.',
    );
  }
  return { rejectUnauthorized: false } as const;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    // Rate limiting global :
    // - 30 req/sec en burst (anti-flood)
    // - 200 req/min (usage normal)
    // - 2000 req/heure (cap dur)
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 30 },
      { name: 'medium', ttl: 60_000, limit: 200 },
      { name: 'long', ttl: 3_600_000, limit: 2000 },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl =
          configService.get<string>('DATABASE_URL') ||
          configService.get<string>('DATABASE_PRIVATE_URL') ||
          configService.get<string>('DATABASE_PUBLIC_URL');
        const useSsl = configService.get<string>('DB_SSL') === 'true';
        const isProd = configService.get<string>('NODE_ENV') === 'production';

        // SÉCURITÉ : synchronize est définitivement désactivé en production.
        // En prod, utiliser exclusivement les migrations TypeORM versionnées.
        const autoSyncRequested = configService.get<string>('AUTO_SYNC_DB') === 'true';
        const autoSync = autoSyncRequested && !isProd;
        if (autoSyncRequested && isProd) {
          console.warn('[db] AUTO_SYNC_DB ignoré en production. Utilisez les migrations.');
        }

        const base = {
          type: 'postgres' as const,
          autoLoadEntities: true,
          synchronize: autoSync,
          logging: !isProd,
          // SSL : en prod, exiger un certificat valide. Le CA peut être passé
          // via DB_CA_CERT (PEM en clair) ou DB_CA_CERT_BASE64 (base64).
          ssl: useSsl ? buildSslConfig(configService, isProd) : undefined,
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

        const username =
          configService.get<string>('DB_USER') ||
          configService.get<string>('PGUSER') ||
          'postgres';
        const password =
          configService.get<string>('DB_PASSWORD') ||
          configService.get<string>('PGPASSWORD') ||
          '';

        if (!password && isProd) {
          throw new Error(
            '[db] DB_PASSWORD/PGPASSWORD est obligatoire en production',
          );
        }

        return {
          ...base,
          host,
          port: parseInt(portRaw, 10),
          username,
          password,
          database,
        };
      },
    }),

    TypeOrmModule.forFeature([Organization]),

    // AuditModule en premier : @Global, fournit AuditService/SoftDeleteService
    // et l'interceptor de contexte requête (acteur, IP, request_id) à tous.
    AuditModule,

    // StorageModule : @Global, expose SupabaseStorageService (uploads/downloads).
    StorageModule,

    // Module public : API publique (careers, etc.) - sans authentification requise
    PublicModule,

    OrganizationsModule,
    UsersModule,
    DepartmentsModule,
    ModulesModule,
    PilotageModule,
    ProjectsModule,
    HrModule,
    FinanceModule,
    AcademyModule,
    DocumentsModule,
    RbacModule,
    AuthModule,
    MigrationsModule,
    DevModule.register(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    TenantMiddleware,
    // Rate limiter global (par IP). S'applique avant l'auth.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Auth Firebase globale. Les routes publiques sont déclarées dans
    // FirebaseAuthGuard.canActivate (uniquement /, /health/db).
    {
      provide: APP_GUARD,
      useExisting: FirebaseAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // TenantMiddleware s'applique sur les routes métiers (core/*), ainsi que
    // sur les outils sensibles (migrations, dev) qui requièrent désormais
    // un contexte d'organisation et la permission SYSTEM_ADMIN.
    // core/auth/* est exclu car la gestion des devices est user-scoped
    // (un user peut lister ses appareils sans préciser d'organisation).
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'core/auth', method: RequestMethod.ALL },
        { path: 'core/auth/*', method: RequestMethod.ALL },
      )
      .forRoutes(
        { path: 'core/*', method: RequestMethod.ALL },
        { path: 'migrations/*', method: RequestMethod.ALL },
        { path: 'dev/*', method: RequestMethod.ALL },
      );
  }
}
