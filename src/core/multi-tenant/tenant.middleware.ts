import { Injectable, NestMiddleware, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import { Repository } from 'typeorm';
import { Organization } from '../organizations/organizations.entity';

export interface TenantContext {
  id: string;
  code: string | null;
  organization: Organization;
}

export interface TenantRequest extends Request {
  tenant?: TenantContext;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
  ) { }

  async use(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
    const orgCodeHeader =
      (req.headers['x-organization-code'] as string | undefined) ??
      (req.headers['X-Organization-Code'] as string | undefined) ??
      undefined;

    if (!orgCodeHeader) {
      throw new BadRequestException('Missing x-organization-code header');
    }

    const trimmedCode = orgCodeHeader.trim().toUpperCase();

    const organization = await this.organizationsRepo
      .createQueryBuilder('org')
      .where('UPPER(org.nameCode) = :code', { code: trimmedCode })
      .getOne();

    if (!organization) {
      throw new NotFoundException(
        `Organization not found for code '${trimmedCode}'`,
      );
    }

    req.tenant = {
      id: organization.id,
      code: organization.nameCode,
      organization,
    };

    return next();
  }
}
