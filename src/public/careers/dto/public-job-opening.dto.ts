/**
 * Public DTO: Job Opening (List View)
 *
 * Retourné dans /GET /public/careers/jobs
 * Le `id` (UUID) n'est PAS exposé : seul le slug sert d'identifiant public
 * pour éviter l'énumération.
 */

export class PublicJobOpeningDto {
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

  /** Organisation propriétaire — affichée sur liveydream.com. */
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
}
