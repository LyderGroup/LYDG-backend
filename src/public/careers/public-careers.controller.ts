/**
 * Controller: Public Careers (liveydream.com)
 *
 * Endpoints publics — pas d'auth, pas de TenantMiddleware.
 * - GET  /public/careers/jobs
 * - GET  /public/careers/jobs/:slug
 * - POST /public/careers/jobs/:slug/apply
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { PublicCareersService } from './public-careers.service';
import {
  PublicJobOpeningListQueryDto,
  PublicJobOpeningDto,
  PublicJobOpeningDetailDto,
  PublicJobApplicationDto,
  PublicJobApplicationResponseDto,
} from './dto';

@Controller('public/careers/jobs')
export class PublicCareersController {
  constructor(private readonly careersService: PublicCareersService) {}

  @Get()
  @HttpCode(200)
  async listPublicJobs(
    @Query() query: PublicJobOpeningListQueryDto,
  ): Promise<{ data: PublicJobOpeningDto[]; meta: any }> {
    return this.careersService.searchPublicJobs(query);
  }

  @Get(':slug')
  @HttpCode(200)
  async getJobBySlug(
    @Param('slug') slug: string,
  ): Promise<PublicJobOpeningDetailDto> {
    return this.careersService.findPublicJobBySlug(slug);
  }

  /**
   * POST /public/careers/jobs/:slug/apply
   * Rate-limit 5 req/min/IP + tracking IP + UA + fingerprint pour anti-spam.
   * Le service rejette aussi si > 10 candidatures sur 24h depuis la même IP.
   */
  @Post(':slug/apply')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard)
  @HttpCode(201)
  async applyToJob(
    @Param('slug') slug: string,
    @Body() applicationData: PublicJobApplicationDto,
    @Req() req: any,
  ): Promise<PublicJobApplicationResponseDto> {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      'unknown';
    const userAgent = (req.headers['user-agent'] as string | undefined) || 'unknown';
    const deviceFingerprint =
      (req.headers['x-device-fingerprint'] as string | undefined) || 'unknown';

    return this.careersService.applyToJobBySlug(slug, applicationData, {
      ipAddress,
      userAgent,
      deviceFingerprint,
    });
  }
}
