import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import { auditContext, AuditContextData } from './audit-context';

/**
 * Injecte les méta-données de la requête HTTP (acteur, IP, UA, request_id)
 * dans un AsyncLocalStorage accessible depuis n'importe quel service.
 *
 * Enregistré globalement dans AppModule pour couvrir TOUS les endpoints
 * sans intervention par contrôleur.
 */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    const data: AuditContextData = {
      actorUserId: req?.user?.id ?? null,
      organizationId: req?.tenant?.id ?? null,
      ip: this.extractIp(req),
      userAgent: req?.headers?.['user-agent'] ?? null,
      requestId:
        req?.headers?.['x-request-id'] ??
        req?.id ??
        randomUUID(), 
      reason:
        req?.headers?.['x-audit-reason'] ??
        req?.body?.auditReason ??
        null,
    };

    return new Observable(subscriber => {
      auditContext.run(data, () => {
        next.handle().subscribe({
          next: v => subscriber.next(v),
          error: e => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }

  private extractIp(req: any): string | null {
    const forwarded = req?.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req?.ip ?? req?.connection?.remoteAddress ?? null;
  }
}
