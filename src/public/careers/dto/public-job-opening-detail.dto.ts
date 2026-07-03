/**
 * Public DTO: Job Opening Detail
 *
 * Retourné dans /GET /public/careers/jobs/:slug
 * Pas d'UUID exposé : seul le slug est public.
 */

export class PublicJobOpeningDetailDto {
  slug: string;
  jobTitle: string;
  jobDescription?: string | null;
  employmentType?: string | null;
  experienceLevel?: string | null;
  salaryRangeMin?: number | null;
  salaryRangeMax?: number | null;
  currency: string;
  openingDate: Date;
  closingDate?: Date | null;
  publishedAt?: Date | null;

  /** Organisation propriétaire (entreprise qui recrute). */
  organization?: {
    name: string;
    code?: string | null;
  };

  department?: {
    name: string;
  };

  position?: {
    title: string;
  };

  /** Métadonnées SEO (canonical URL → liveydream.com). */
  meta?: {
    canonicalUrl?: string;
    metaDescription?: string;
    keywords?: string[];
  };
}
