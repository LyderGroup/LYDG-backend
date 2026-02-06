import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from './user-role.entity';
import { Role } from './role.entity';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
  ) {}

  async userHasAnyRole(
    userId: string,
    roleCodes: string[],
    organizationId?: string,
  ): Promise<boolean> {
    if (!roleCodes.length) {
      return true;
    }

    const qb = this.userRolesRepo
      .createQueryBuilder('ur')
      .innerJoin(Role, 'r', 'r.id = ur.role_id')
      .where('ur.user_id = :userId', { userId })
      .andWhere('ur.is_active = true')
      .andWhere('(ur.expires_at IS NULL OR ur.expires_at > NOW())')
      .andWhere('r.is_active = true')
      .andWhere('r.code IN (:...codes)', { codes: roleCodes })
      .limit(1);

    if (organizationId) {
      qb.andWhere(
        '(r.organization_id = :orgId OR r.is_system_role = true)',
        { orgId: organizationId },
      );
    }

    const match = await qb.getOne();
    return !!match;
  }
}
