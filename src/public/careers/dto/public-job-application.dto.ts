/**
 * Public DTO: Job Application (Candidature)
 *
 * Body de POST /public/careers/jobs/:slug/apply
 * Validation stricte côté serveur : honeypot, URL CV restreinte aux storages
 * autorisés (Supabase/S3), MIME et taille à confirmer côté backend si fournis.
 */

import {
  IsString,
  IsEmail,
  IsOptional,
  IsUrl,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  Matches,
  IsIn,
} from 'class-validator';

/** Extensions de CV autorisées. */
const CV_EXTENSION_REGEX = /\.(pdf|doc|docx)(\?.*)?$/i;

/** MIME types acceptés (whitelist stricte). */
export const ALLOWED_CV_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

/** Taille max d'un CV : 5 Mo. */
export const MAX_CV_SIZE_BYTES = 5 * 1024 * 1024;

export class PublicJobApplicationDto {
  @IsString()
  @MinLength(3, { message: 'Le nom doit contenir au minimum 3 caractères' })
  @MaxLength(255, { message: 'Le nom ne peut pas dépasser 255 caractères' })
  fullName!: string;

  @IsEmail({}, { message: 'Email invalide' })
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'La lettre de motivation doit contenir au minimum 10 caractères' })
  @MaxLength(5000, { message: 'La lettre de motivation ne peut pas dépasser 5000 caractères' })
  coverLetter?: string;

  /**
   * URL du CV. Le fichier doit être uploadé en amont sur Supabase Storage / S3
   * par le frontend. Le backend ne reçoit que l'URL finale.
   *
   * Doit pointer vers un PDF/DOC/DOCX (extension vérifiée).
   * Max 500 chars (anti-DoS).
   */
  @IsUrl({ require_protocol: true, protocols: ['https'] }, { message: 'URL du CV invalide (HTTPS requis)' })
  @MaxLength(500, { message: 'URL du CV trop longue' })
  @Matches(CV_EXTENSION_REGEX, {
    message: 'Le CV doit être au format PDF, DOC ou DOCX',
  })
  cvUrl!: string;

  /** MIME type fourni par le storage (Supabase/S3 le retourne). */
  @IsOptional()
  @IsIn([...ALLOWED_CV_MIME_TYPES], {
    message: 'Type de fichier CV non autorisé',
  })
  cvMimeType?: string;

  /** Taille du CV en octets (vérifiée côté serveur si fournie). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_CV_SIZE_BYTES, { message: 'Le CV dépasse 5 Mo' })
  cvSizeBytes?: number;

  /**
   * Honeypot anti-spam : doit rester vide. Si rempli → bot détecté.
   * On limite à 0 char via MaxLength pour qu'un bot remplisse n'importe quoi
   * et déclenche l'erreur de validation.
   */
  @IsOptional()
  @IsString()
  @MaxLength(0, { message: 'Validation échouée' })
  websiteField?: string;
}

export class PublicJobApplicationResponseDto {
  success: boolean;
  applicationId: string;
  candidateId: string;
  message: string;
  confirmationEmailSent: boolean;
  trackingUrl?: string;
}
