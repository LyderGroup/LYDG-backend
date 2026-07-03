import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { RbacService } from './rbac.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest() as any;
    const user = request.user;
    const headerUserId =
      request.headers['x-user-id'] ?? request.headers['X-User-Id'];

    let userId: string | undefined;

    if (user && user.id) {
      userId = String(user.id);
    } else if (typeof headerUserId === 'string') {
      userId = headerUserId;
    } else if (Array.isArray(headerUserId) && headerUserId.length > 0) {
      userId = String(headerUserId[0]);
    }

    if (!userId) {
      return false;
    }

    const tenant = request.tenant as { id?: string | undefined };
    const organizationId = tenant?.id;

    // Plus de rôle système - vérifier uniquement les rôles d'organisation
    return this.rbacService.userHasAnyRole(userId, requiredRoles, organizationId);
  }
}
