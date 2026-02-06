import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './organizations.entity';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
  ) {}

  async findAllForTenant(organizationId: string): Promise<Organization[]> {
    return this.organizationsRepo.find({
      where: {id: organizationId},
      order: {
        createdAt: 'DESC',
      },
      take: 200,
    });
  }
}
