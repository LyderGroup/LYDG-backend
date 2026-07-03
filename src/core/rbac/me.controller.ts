import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from './user-role.entity';
import { Organization } from '../organizations/organizations.entity';
import { Employee } from '../hr/employee.entity';

@Controller('me')
export class MeController {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) { }

  @Get('organizations')
  async getOrganizations(@Req() req: any) {
    const currentUser = req.user;

    if (!currentUser || !currentUser.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    const userRoles = await this.userRolesRepo.find({
      where: { userId: currentUser.id, isActive: true },
      relations: ['role', 'role.organization', 'role.rolePermissions', 'role.rolePermissions.permission'],
      order: { assignedAt: 'DESC' },
    });

    // Plus de rôle système - vérifier la permission hr.organizations.read.all
    const hasAllOrgsPermission = userRoles.some((ur) =>
      ur.role?.rolePermissions?.some((rp: any) => rp.permission?.code === 'hr.organizations.read.all')
    );

    if (hasAllOrgsPermission) {
      return this.organizationsRepo.find({
        order: { createdAt: 'DESC' },
        take: 500,
      });
    }

    const organizationsMap = new Map<string, any>();

    for (const ur of userRoles) {
      const org = ur.role?.organization;
      if (org && !organizationsMap.has(org.id)) {
        organizationsMap.set(org.id, org);
      }
    }

    if (organizationsMap.size === 0 && currentUser.organizationId) {
      const org = await this.organizationsRepo.findOne({
        where: { id: currentUser.organizationId },
      });
      if (org) {
        organizationsMap.set(org.id, org);
      }
    }

    const parentIds = Array.from(organizationsMap.keys());
    if (parentIds.length > 0) {
      const children = await this.organizationsRepo.find({
        where: { parentOrgId: In(parentIds) },
        order: { createdAt: 'DESC' },
        take: 500,
      });

      for (const child of children) {
        if (!organizationsMap.has(child.id)) {
          organizationsMap.set(child.id, child);
        }
      }
    }

    return Array.from(organizationsMap.values());
  }

  @Get('profile')
  async getProfile(@Req() req: any) {
    const currentUser = req.user;

    if (!currentUser || !currentUser.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    const orgCodeHeader = req.headers?.['x-organization-code'];
    const orgCode = Array.isArray(orgCodeHeader) ? orgCodeHeader[0] : orgCodeHeader;

    const organization = orgCode
      ? await this.organizationsRepo.findOne({ where: { nameCode: orgCode } })
      : null;

    const userRoles = await this.userRolesRepo
      .createQueryBuilder('ur')
      .leftJoinAndSelect('ur.role', 'role')
      .leftJoinAndSelect('role.organization', 'organization')
      .where('ur.user_id = :userId', { userId: currentUser.id })
      .andWhere('ur.is_active = true')
      .andWhere('(ur.expires_at IS NULL OR ur.expires_at > NOW())')
      .andWhere('role.is_active = true')
      .orderBy('ur.assigned_at', 'DESC')
      .getMany();

    const matchingRole = (() => {
      if (organization) {
        const orgRole = userRoles.find((ur) => ur.role?.organization?.id === organization.id)?.role;
        return orgRole ?? null;
      }

      return userRoles[0]?.role ?? null;
    })();

    // Récupérer l'employé pour les horaires de travail et la date de naissance
    let employee: any = null;
    if (currentUser.employeeId) {
      employee = await this.employeeRepo
        .createQueryBuilder('e')
        .select(['e.workStartTime', 'e.workEndTime', 'e.birthDate'])
        .where('e.id = :id', { id: currentUser.employeeId })
        .getOne();
    }

    return {
      user: {
        id: currentUser.id,
        email: currentUser.email ?? null,
        employeeId: currentUser.employeeId ?? null,
        firstName: currentUser.firstName ?? null,
        lastName: currentUser.lastName ?? null,
        workStartTime: employee?.workStartTime ?? null,
        workEndTime: employee?.workEndTime ?? null,
        birthDate: employee?.birthDate ?? currentUser.birthDate ?? null,
      },
      organization: organization
        ? {
          id: organization.id,
          name: organization.name,
          nameCode: organization.nameCode,
        }
        : null,
      role: matchingRole
        ? {
          id: matchingRole.id,
          name: matchingRole.name,
          code: matchingRole.code,
        }
        : null,
    };
  }
}
