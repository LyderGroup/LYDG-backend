import { Injectable, CanActivate } from '@nestjs/common';

/**
 * @deprecated DevAuthGuard a été retiré pour des raisons de sécurité.
 * Il acceptait toutes les requêtes sans vérification, ce qui constituait
 * une faille critique. Utiliser FirebaseAuthGuard + PermissionGuard.
 *
 * Conservé temporairement pour ne pas casser les imports existants ;
 * supprimer après refactoring complet.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(): boolean {
    // SÉCURITÉ : refus par défaut. Cette classe ne doit plus être utilisée.
    return false;
  }
}
