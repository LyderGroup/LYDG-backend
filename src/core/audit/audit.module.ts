import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';
import { AuditSubscriber } from './audit.subscriber';
import { AuditContextInterceptor } from './audit-context.interceptor';
import { SoftDeleteService } from './soft-delete.service';
import { AuditController } from './audit.controller';
import { RbacModule } from '../rbac/rbac.module';

/**
 * Module global d'audit et de soft-delete.
 *
 * - AuditService : émet des entrées dans core.audit_logs
 * - AuditSubscriber : capture auto les CREATE/UPDATE/DELETE sur entités @Auditable
 * - SoftDeleteService : helpers softDelete / restore / hardDeleteAfterRetention
 * - AuditContextInterceptor : injecte le contexte requête (acteur, IP, request_id)
 * - AuditController : endpoints /core/audit/* pour consulter l'historique
 *
 * Importé une seule fois dans AppModule, exporté pour usage transverse.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), RbacModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditSubscriber,
    SoftDeleteService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditContextInterceptor,
    },
  ],
  exports: [AuditService, SoftDeleteService],
})
export class AuditModule {}
