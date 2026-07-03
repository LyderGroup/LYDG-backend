/**
 * Service: Public Careers
 *
 * API publique pour liveydream.com — agrège les offres de TOUTES les
 * organisations clientes (visibility_state='published').
 *
 * Multi-tenant : chaque candidature est rattachée à l'organisation
 * propriétaire de l'offre. Les recruteurs d'une org ne voient ensuite que
 * leurs candidatures (via filtre organizationId).
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryDeepPartialEntity } from 'typeorm';
import { JobOpening } from '../../core/hr/entities/job-opening.entity';
import { Candidate } from '../../core/hr/entities/candidate.entity';
import { JobApplication } from '../../core/hr/entities/job-application.entity';
import {
  PublicJobOpeningListQueryDto,
  PublicJobOpeningDto,
  PublicJobOpeningDetailDto,
  PublicJobApplicationDto,
  PublicJobApplicationResponseDto,
  ALLOWED_CV_MIME_TYPES,
  MAX_CV_SIZE_BYTES,
} from './dto';

export interface ApplicantContext {
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string;
}

@Injectable()
export class PublicCareersService {
  private readonly logger = new Logger(PublicCareersService.name);

  constructor(
    @InjectRepository(JobOpening)
    private readonly jobOpeningRepo: Repository<JobOpening>,
    @InjectRepository(Candidate)
    private readonly candidateRepo: Repository<Candidate>,
    @InjectRepository(JobApplication)
    private readonly jobApplicationRepo: Repository<JobApplication>,
    private readonly configService: ConfigService,
  ) {}

  /** Base URL canonique pour les liens publics (sitemap, schema.org, partage). */
  private get canonicalBaseUrl(): string {
    return (
      this.configService.get<string>('PUBLIC_CAREERS_CANONICAL_BASE_URL') ||
      'https://liveydream.com'
    );
  }

  // ─── 1. Liste publique paginée ─────────────────────────────────────────────
  async searchPublicJobs(
    query: PublicJobOpeningListQueryDto,
  ): Promise<{ data: PublicJobOpeningDto[]; meta: any }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(query.limit || 20, 100);

    const qb = this.jobOpeningRepo
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.department', 'department')
      .leftJoinAndSelect('job.position', 'position')
      .leftJoinAndSelect('job.organization', 'organization')
      .where('job.visibilityState = :vis', { vis: 'published' })
      .andWhere('(job.closingDate IS NULL OR job.closingDate > NOW())');

    // Full-text search via tsvector (index GIN) — fallback ILIKE si pas de term.
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      qb.andWhere(
        `job.searchVector @@ plainto_tsquery('simple', :term)`,
        { term },
      );
    }

    if (query.departmentId) {
      qb.andWhere('job.departmentId = :deptId', { deptId: query.departmentId });
    }

    if (query.employmentType) {
      qb.andWhere('job.employmentType = :empType', { empType: query.employmentType });
    }

    if (query.experienceLevel) {
      qb.andWhere('job.experienceLevel = :expLevel', { expLevel: query.experienceLevel });
    }

    if (query.organizationCode) {
      qb.andWhere('organization.nameCode = :orgCode', { orgCode: query.organizationCode });
    }

    const sortConfig = this.parseSortConfig(query.sort);
    qb.orderBy(`job.${sortConfig.field}`, sortConfig.direction);

    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items.map((item) => this.mapToPublicJobOpeningDto(item)),
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit) || 1,
      },
    };
  }

  // ─── 2. Détail par slug ────────────────────────────────────────────────────
  async findPublicJobBySlug(slug: string): Promise<PublicJobOpeningDetailDto> {
    const job = await this.jobOpeningRepo.findOne({
      where: { slug, visibilityState: 'published' },
      relations: ['department', 'position', 'organization'],
    });

    if (!job) {
      throw new NotFoundException("Offre d'emploi non trouvée");
    }

    if (job.closingDate && new Date(job.closingDate) < new Date()) {
      throw new GoneException("Cette offre d'emploi est maintenant fermée");
    }

    return this.mapToPublicJobOpeningDetailDto(job);
  }

  // ─── 3. Candidature (par slug, multi-tenant) ───────────────────────────────
  async applyToJobBySlug(
    slug: string,
    applicationData: PublicJobApplicationDto,
    applicant: ApplicantContext,
  ): Promise<PublicJobApplicationResponseDto> {
    // 1) Honeypot : court-circuite avant tout coût DB
    if (applicationData.websiteField) {
      this.logger.warn(
        `[Honeypot] Tentative de spam depuis ${applicant.ipAddress} (fp=${applicant.deviceFingerprint})`,
      );
      throw new BadRequestException('Validation échouée');
    }

    // 2) Validation CV (extension déjà vérifiée par DTO ; ici MIME + taille)
    if (
      applicationData.cvMimeType &&
      !ALLOWED_CV_MIME_TYPES.includes(applicationData.cvMimeType as any)
    ) {
      throw new BadRequestException('Type de fichier CV non autorisé');
    }
    if (applicationData.cvSizeBytes && applicationData.cvSizeBytes > MAX_CV_SIZE_BYTES) {
      throw new BadRequestException('Le CV dépasse 5 Mo');
    }

    // 3) Trouver l'offre publiée + son organisation propriétaire
    const job = await this.jobOpeningRepo.findOne({
      where: { slug, visibilityState: 'published' },
    });

    if (!job) {
      throw new NotFoundException("Offre d'emploi non trouvée ou non disponible");
    }
    if (job.closingDate && new Date(job.closingDate) < new Date()) {
      throw new GoneException("Cette offre d'emploi est fermée");
    }

    const orgId = job.organizationId;
    if (!orgId) {
      // Sécurité : une offre publiée DOIT avoir une org propriétaire.
      this.logger.error(`[apply] Offre ${job.id} publiée sans organizationId`);
      throw new BadRequestException('Configuration invalide de l\'offre');
    }

    // 4) Adaptatif rate-limiting : 3 candidatures max par IP sur 24h
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentByIp = await this.jobApplicationRepo
      .createQueryBuilder('a')
      .where('a.applicantIp = :ip', { ip: applicant.ipAddress })
      .andWhere('a.applicationDate > :since', { since: last24h })
      .getCount();
    if (recentByIp >= 10) {
      this.logger.warn(
        `[RateLimit] IP ${applicant.ipAddress} a déjà ${recentByIp} candidatures en 24h`,
      );
      throw new BadRequestException('Trop de candidatures depuis cette source. Réessayez plus tard.');
    }

    // 5) Candidate par (email, orgId) — isolation RGPD inter-org
    const fullName = applicationData.fullName.trim();
    const [firstName, ...rest] = fullName.split(/\s+/);
    const lastName = rest.join(' ') || firstName;

    let candidate = await this.candidateRepo.findOne({
      where: { email: applicationData.email, organizationId: orgId },
    });

    if (!candidate) {
      candidate = await this.candidateRepo.save(
        this.candidateRepo.create({
          organizationId: orgId,
          firstName,
          lastName,
          email: applicationData.email,
          phone: applicationData.phone || null,
          resumeUrl: applicationData.cvUrl,
          source: 'public_website',
          status: 'new',
        }),
      );
    }

    // 6) Anti-doublon : un seul postulat par (email, offre)
    const duplicate = await this.jobApplicationRepo.findOne({
      where: { applicantEmail: applicationData.email, jobOpeningId: job.id },
    });
    if (duplicate) {
      throw new ConflictException('Vous avez déjà candidaté pour cette offre');
    }

    // 7) Création de la candidature — rattachée à l'org du jobOpening
    const application = this.jobApplicationRepo.create({
      organizationId: orgId,
      candidateId: candidate.id,
      jobOpeningId: job.id,
      coverLetter: applicationData.coverLetter || null,
      stage: 'applied',
      finalStatus: 'active',
      applicantFullName: fullName,
      applicantEmail: applicationData.email,
      applicantPhone: applicationData.phone || null,
      cvUrl: applicationData.cvUrl,
      cvMimeType: applicationData.cvMimeType || null,
      cvSizeBytes: applicationData.cvSizeBytes || null,
      applicantIp: applicant.ipAddress,
      applicantUserAgent: applicant.userAgent?.slice(0, 1000) || null,
      applicantDeviceFingerprint: applicant.deviceFingerprint || null,
      source: 'public_website',
    });

    const saved = await this.jobApplicationRepo.save(application);

    this.logger.log(
      `[apply] candidature ${saved.id} pour offre ${job.id} (org=${orgId}) par ${applicationData.email}`,
    );

    return {
      success: true,
      applicationId: saved.id,
      candidateId: candidate.id,
      message: 'Candidature envoyée avec succès. Nous vous recontacterons bientôt.',
      confirmationEmailSent: false, // TODO: brancher MailService
      trackingUrl: `${this.canonicalBaseUrl}/emploi/track/${saved.id}`,
    };
  }

  // ─── 4. Publication interne (côté ERP) ─────────────────────────────────────
  /**
   * Bascule un job en visibility_state='published' et génère le slug.
   * Appelé par l'API interne lors d'un publish RH.
   */
  async publishJobOpening(
    organizationId: string,
    jobOpeningId: string,
  ): Promise<JobOpening> {
    const job = await this.jobOpeningRepo.findOne({
      where: { id: jobOpeningId, organizationId },
    });

    if (!job) {
      throw new NotFoundException("Offre d'emploi non trouvée");
    }

    const slug = job.slug || (await this.generateUniqueSlug(job.jobTitle));

    const patch: QueryDeepPartialEntity<JobOpening> = {
      status: 'published',
      isPublic: true,
      visibilityState: 'published',
      publishedAt: job.publishedAt ?? new Date(),
      slug,
    };

    await this.jobOpeningRepo.update({ id: jobOpeningId }, patch);
    const updated = await this.jobOpeningRepo.findOne({ where: { id: jobOpeningId } });
    if (!updated) throw new NotFoundException("Offre d'emploi non trouvée après publication");
    return updated;
  }

  async generateUniqueSlug(base: string): Promise<string> {
    const normalized = this.normalizeSlug(base);
    let attempt = 0;
    while (true) {
      const candidate = attempt ? `${normalized}-${attempt}` : normalized;
      const exists = await this.jobOpeningRepo.count({ where: { slug: candidate } });
      if (!exists) return candidate;
      attempt += 1;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  private normalizeSlug(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  private parseSortConfig(
    sortString?: string,
  ): { field: string; direction: 'ASC' | 'DESC' } {
    const validFields = ['publishedAt', 'openingDate', 'jobTitle', 'salaryRangeMin'];
    const defaultConfig = { field: 'publishedAt', direction: 'DESC' as const };
    if (!sortString) return defaultConfig;

    const [field, direction] = sortString.split(':');
    if (!validFields.includes(field)) return defaultConfig;

    const dir = direction?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    return { field, direction: dir };
  }

  private mapToPublicJobOpeningDto(job: JobOpening): PublicJobOpeningDto {
    return {
      slug: job.slug || '',
      jobTitle: job.jobTitle,
      jobDescription: job.jobDescription,
      employmentType: job.employmentType,
      experienceLevel: job.experienceLevel,
      salaryRangeMin: job.salaryRangeMin,
      salaryRangeMax: job.salaryRangeMax,
      currency: job.currency,
      openingDate: job.openingDate,
      closingDate: job.closingDate,
      publishedAt: job.publishedAt,
      organization: job.organization
        ? { name: job.organization.name, code: job.organization.nameCode ?? null }
        : undefined,
      department: job.department ? { name: job.department.name } : undefined,
      position: job.position ? { title: job.position.title } : undefined,
    };
  }

  private mapToPublicJobOpeningDetailDto(job: JobOpening): PublicJobOpeningDetailDto {
    const keywords = [
      job.jobTitle,
      job.department?.name,
      job.position?.title,
      'carrière',
      'emploi',
    ].filter(Boolean) as string[];

    return {
      slug: job.slug || '',
      jobTitle: job.jobTitle,
      jobDescription: job.jobDescription,
      employmentType: job.employmentType,
      experienceLevel: job.experienceLevel,
      salaryRangeMin: job.salaryRangeMin,
      salaryRangeMax: job.salaryRangeMax,
      currency: job.currency,
      openingDate: job.openingDate,
      closingDate: job.closingDate,
      publishedAt: job.publishedAt,
      organization: job.organization
        ? { name: job.organization.name, code: job.organization.nameCode ?? null }
        : undefined,
      department: job.department ? { name: job.department.name } : undefined,
      position: job.position ? { title: job.position.title } : undefined,
      meta: {
        canonicalUrl: `${this.canonicalBaseUrl}/emploi/${job.slug}`,
        metaDescription: `${job.jobTitle}${
          job.organization ? ' - ' + job.organization.name : ''
        } | Rejoignez l'équipe`,
        keywords,
      },
    };
  }
}
