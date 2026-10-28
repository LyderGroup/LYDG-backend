import { Injectable } from '@nestjs/common';

/**
 * Presence en ligne des utilisateurs.
 *
 * Un utilisateur est "en ligne" tant qu'au moins un de ses onglets garde le
 * socket temps reel ouvert. On compte les sockets plutot qu'un simple
 * booleen : fermer un onglet ne doit pas faire passer hors ligne quelqu'un qui
 * en a un second ouvert.
 *
 * Etat en memoire : valable tant que le backend tourne en un seul processus,
 * ce qui est le cas. Un redemarrage remet tout le monde hors ligne, puis les
 * clients se reconnectent d'eux-memes en quelques secondes.
 */
@Injectable()
export class PresenceService {
  private readonly sockets = new Map<string, number>();

  connect(userId: string): void {
    this.sockets.set(userId, (this.sockets.get(userId) ?? 0) + 1);
  }

  disconnect(userId: string): void {
    const n = (this.sockets.get(userId) ?? 0) - 1;
    if (n > 0) this.sockets.set(userId, n);
    else this.sockets.delete(userId);
  }

  isOnline(userId: string): boolean {
    return (this.sockets.get(userId) ?? 0) > 0;
  }
}
