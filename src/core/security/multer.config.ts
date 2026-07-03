import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Limites par défaut pour les uploads (taille max).
 */
export const DEFAULT_MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

/**
 * Listes de MIME types autorisés selon l'usage.
 */
export const MIME_DOCUMENTS = [
  'application/pdf',
];

export const MIME_IMAGES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

export const MIME_OFFICE = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
];

const ALLOWED_EXT = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt',
]);

interface BuildOptions {
  /**
   * Sous-dossier logique dans le bucket Storage (ex: 'employee-documents').
   * Sert de préfixe de clé ; voir makeStorageKey().
   */
  subdir: string;
  /** Liste des MIME types acceptés. */
  allowedMimes: readonly string[];
  /** Taille max en octets. Par défaut 15 MB. */
  maxFileSize?: number;
}

/**
 * Construit un chemin de clé Storage sûr : "<subdir>/<uuid><ext>".
 * Le nom d'origine n'est jamais utilisé comme clé (uniquement conservé en DB
 * comme `fileName`).
 */
export function makeStorageKey(subdir: string, originalName: string): string {
  const ext = extname(originalName).toLowerCase();
  return `${subdir}/${uuidv4()}${ext}`;
}

/**
 * Construit une configuration FileInterceptor sécurisée :
 * - Stockage EN MÉMOIRE (file.buffer) : les fichiers partent ensuite vers
 *   Supabase Storage (le disque Render est éphémère).
 * - fileFilter sur MIME type + extension.
 * - limits.fileSize pour empêcher les uploads géants (DoS).
 */
export function buildUploadConfig(opts: BuildOptions) {
  return {
    storage: memoryStorage(),
    fileFilter: (
      _req: any,
      file: { mimetype: string; originalname: string },
      cb: (err: Error | null, accept: boolean) => void,
    ) => {
      const ext = extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return cb(new BadRequestException(`Extension de fichier non autorisée: ${ext}`), false);
      }
      if (!opts.allowedMimes.includes(file.mimetype)) {
        return cb(
          new BadRequestException(
            `Type de fichier non autorisé: ${file.mimetype}. Types acceptés: ${opts.allowedMimes.join(', ')}`,
          ),
          false,
        );
      }
      cb(null, true);
    },
    limits: {
      fileSize: opts.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      files: 1,
    },
  };
}
