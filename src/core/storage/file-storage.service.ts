import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { dirname, extname, join, resolve, sep } from 'path';

/**
 * Stockage de fichiers sur le disque du serveur.
 *
 * Remplace l'ancien SupabaseStorageService. Le choix de Supabase Storage était
 * dicté par Render, dont le disque est éphémère ; sur un VPS le disque est
 * persistant, et il n'y a plus de raison de dépendre d'un service externe.
 *
 * Les fichiers ne sont jamais servis directement par le serveur web : la racine
 * de stockage est hors du dossier public, et les téléchargements passent par le
 * backend (vérification de permission puis lecture). Voir le middleware
 * /uploads de main.ts et l'endpoint permissionné des documents RH.
 *
 * Les clés sont des chemins relatifs du type « hr-documents/<uuid>.pdf ».
 */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly root: string;

  /**
   * Types MIME déduits de l'extension.
   *
   * Supabase renvoyait le type enregistré à l'upload ; le système de fichiers
   * ne conserve pas cette information. L'extension est une source suffisante
   * ici : main.ts décide déjà de l'affichage en ligne de la même manière.
   */
  private static readonly MIME_TYPES: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
  };

  constructor(private readonly config: ConfigService) {
    // Chemin absolu attendu en production (ex. /var/lib/obbios/uploads), pour
    // que les fichiers survivent à un redéploiement du code.
    this.root = resolve(
      this.config.get<string>('STORAGE_ROOT') || join(process.cwd(), 'storage'),
    );
  }

  /**
   * Résout une clé en chemin absolu, en refusant toute sortie de la racine.
   *
   * `key` vient d'une URL (`/uploads/<key>`) : sans cette vérification, une clé
   * comme `../../etc/passwd` lirait hors du stockage. On compare le chemin
   * résolu à la racine plutôt que de filtrer les `..` à la main, ce qui couvre
   * aussi les séparateurs mixtes et les formes encodées déjà décodées.
   */
  private resolveKey(key: string): string {
    const target = resolve(this.root, key);
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new InternalServerErrorException('Chemin de fichier invalide');
    }
    return target;
  }

  /**
   * Écrit un buffer sous `key` et retourne la clé.
   *
   * Écriture atomique : on écrit dans un fichier temporaire puis on renomme.
   * Sans cela, une interruption en cours d'écriture laisserait un fichier
   * tronqué que rien ne distinguerait d'un fichier valide.
   */
  async upload(
    key: string,
    buffer: Buffer,
    // Conservé pour garder l'interface de stockage inchangée côté appelants
    // (et pour une implémentation objet type S3 qui, elle, persiste le type).
    // Le système de fichiers ne stocke pas le MIME : il est redéduit de
    // l'extension à la lecture, voir contentTypeFor().
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    contentType: string,
  ): Promise<string> {
    const target = this.resolveKey(key);
    const temp = `${target}.${process.pid}.tmp`;

    try {
      await fs.mkdir(dirname(target), { recursive: true });
      await fs.writeFile(temp, buffer);
      await fs.rename(temp, target);
      return key;
    } catch (err) {
      // Ne pas laisser le fichier temporaire derrière en cas d'échec.
      await fs.rm(temp, { force: true }).catch(() => undefined);
      this.logger.error(`Upload échoué (${key}): ${String(err)}`);
      throw new InternalServerErrorException("Échec de l'upload du fichier");
    }
  }

  /** Lit un fichier en Buffer. Retourne null s'il est absent. */
  async download(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    let target: string;
    try {
      target = this.resolveKey(key);
    } catch {
      return null;
    }

    try {
      const buffer = await fs.readFile(target);
      return { buffer, contentType: FileStorageService.contentTypeFor(key) };
    } catch {
      // Fichier absent ou illisible : l'appelant répond 404.
      return null;
    }
  }

  /** Supprime un fichier (best-effort, ne lève pas). */
  async remove(key: string): Promise<void> {
    try {
      await fs.rm(this.resolveKey(key), { force: true });
    } catch (err) {
      this.logger.warn(`Suppression échouée (${key}): ${String(err)}`);
    }
  }

  /** Type MIME déduit de l'extension, générique par défaut. */
  static contentTypeFor(key: string): string {
    return (
      FileStorageService.MIME_TYPES[extname(key).toLowerCase()] ||
      'application/octet-stream'
    );
  }

  /** Convertit un chemin « /uploads/<key> » en clé de stockage « <key> ». */
  static keyFromUploadsUrl(url: string): string {
    return url.replace(/^\/?uploads\//, '');
  }
}
