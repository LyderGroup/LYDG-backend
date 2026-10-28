import { Global, Module } from '@nestjs/common';
import { PresenceService } from './presence.service';

/**
 * Global : la passerelle temps reel (module Projets) l'alimente, le module
 * Utilisateurs la lit. Un import croise entre les deux creerait une
 * dependance circulaire.
 */
@Global()
@Module({
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
