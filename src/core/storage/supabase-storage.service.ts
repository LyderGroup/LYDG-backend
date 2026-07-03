import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Accès au stockage de fichiers Supabase Storage (bucket privé).
 *
 * Toutes les opérations utilisent la SERVICE_ROLE key : le bucket n'est jamais
 * exposé publiquement, les téléchargements passent par le backend (permission
 * puis stream). Le disque Render étant éphémère, c'est la source de vérité des
 * fichiers uploadés (documents RH, pièces jointes congés, documents requis).
 *
 * Le client est initialisé paresseusement : si les variables ne sont pas encore
 * configurées, l'app démarre quand même et l'erreur ne survient qu'au 1er accès.
 */
@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private client: SupabaseClient | null = null;
  private bucketEnsured = false;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket =
      this.config.get<string>('SUPABASE_STORAGE_BUCKET') || 'uploads';
  }

  private getClient(): SupabaseClient {
    if (this.client) return this.client;
    const url = this.config.get<string>('SUPABASE_URL');
    const serviceKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) {
      throw new InternalServerErrorException(
        'Stockage fichiers non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants).',
      );
    }
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.client;
  }

  /** Crée le bucket privé s'il n'existe pas (une seule fois par process). */
  private async ensureBucket(client: SupabaseClient): Promise<void> {
    if (this.bucketEnsured) return;
    const { error } = await client.storage.createBucket(this.bucket, {
      public: false,
    });
    // "already exists" n'est pas une erreur pour nous.
    if (error && !/already exists/i.test(error.message)) {
      this.logger.warn(
        `Création du bucket "${this.bucket}" impossible: ${error.message}`,
      );
    }
    this.bucketEnsured = true;
  }

  /**
   * Upload un buffer sous `key` (upsert). Retourne la clé Storage.
   * `key` = chemin relatif type "hr-documents/<uuid>.pdf".
   */
  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const client = this.getClient();
    await this.ensureBucket(client);
    const { error } = await client.storage
      .from(this.bucket)
      .upload(key, buffer, { contentType, upsert: true });
    if (error) {
      this.logger.error(`Upload échoué (${key}): ${error.message}`);
      throw new InternalServerErrorException("Échec de l'upload du fichier");
    }
    return key;
  }

  /** Télécharge un fichier en Buffer. Retourne null si absent. */
  async download(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const { data, error } = await this.getClient()
      .storage.from(this.bucket)
      .download(key);
    if (error || !data) return null;
    const arrayBuffer = await data.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: data.type || 'application/octet-stream',
    };
  }

  /** Supprime un fichier (best-effort, ne throw pas). */
  async remove(key: string): Promise<void> {
    try {
      const { error } = await this.getClient()
        .storage.from(this.bucket)
        .remove([key]);
      if (error) {
        this.logger.warn(`Suppression échouée (${key}): ${error.message}`);
      }
    } catch (e) {
      this.logger.warn(`Suppression échouée (${key}): ${String(e)}`);
    }
  }

  /** Convertit un chemin "/uploads/<key>" en clé Storage "<key>". */
  static keyFromUploadsUrl(url: string): string {
    return url.replace(/^\/?uploads\//, '');
  }
}
