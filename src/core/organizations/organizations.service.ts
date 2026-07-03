import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsOptional, IsBoolean, IsUUID, IsEmail } from 'class-validator';
import { Organization } from './organizations.entity';

export class CreateOrganizationDto {
  @IsString()
  name: string = '';

  @IsString()
  @IsOptional()
  nameCode?: string;

  @IsString()
  @IsOptional()
  officialName?: string;

  @IsString()
  @IsOptional()
  registrationNumber?: string;

  @IsString()
  country: string = '';

  @IsString()
  @IsOptional()
  region?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  /** Domaine email pro pour la génération automatique des comptes employés. */
  @IsString()
  @IsOptional()
  emailDomain?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsUUID()
  @IsOptional()
  parentOrgId?: string;

  @IsBoolean()
  @IsOptional()
  isRootOrganization?: boolean;

  @IsString()
  @IsOptional()
  isolationLevel?: string;
}

export class UpdateOrganizationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  nameCode?: string;

  @IsString()
  @IsOptional()
  officialName?: string;

  @IsString()
  @IsOptional()
  registrationNumber?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  region?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  /** Domaine email pro pour la génération automatique des comptes employés. */
  @IsString()
  @IsOptional()
  emailDomain?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsUUID()
  @IsOptional()
  parentOrgId?: string | null;

  @IsBoolean()
  @IsOptional()
  isRootOrganization?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  isolationLevel?: string;
}

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepo: Repository<Organization>,
  ) { }

  async findAllForTenant(organizationId: string): Promise<Organization[]> {
    return this.organizationsRepo.find({
      where: { id: organizationId },
      order: {
        createdAt: 'DESC',
      },
      take: 200,
    });
  }

  async listAll(): Promise<Organization[]> {
    return this.organizationsRepo.find({
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  async findById(id: string): Promise<Organization | null> {
    return this.organizationsRepo.findOne({ where: { id } });
  }

  async create(dto: CreateOrganizationDto, userId: string): Promise<Organization> {
    if (dto.nameCode) {
      const existing = await this.organizationsRepo.findOne({
        where: { nameCode: dto.nameCode },
      });
      if (existing) {
        throw new BadRequestException('Ce code organisation existe déjà');
      }
    }

    const org = this.organizationsRepo.create({
      ...dto,
      createdBy: userId,
    });

    return this.organizationsRepo.save(org);
  }

  async update(id: string, dto: UpdateOrganizationDto, userId: string): Promise<Organization> {
    const org = await this.organizationsRepo.findOne({ where: { id } });
    if (!org) {
      throw new NotFoundException('Organisation non trouvée');
    }

    if (dto.nameCode && dto.nameCode !== org.nameCode) {
      const existing = await this.organizationsRepo.findOne({
        where: { nameCode: dto.nameCode },
      });
      if (existing) {
        throw new BadRequestException('Ce code organisation existe déjà');
      }
    }

    Object.assign(org, dto, { updatedBy: userId });
    return this.organizationsRepo.save(org);
  }

  async delete(id: string): Promise<void> {
    const org = await this.organizationsRepo.findOne({ where: { id } });
    if (!org) {
      throw new NotFoundException('Organisation non trouvée');
    }

    // Vérifier s'il y a des organisations enfants
    const children = await this.organizationsRepo.find({
      where: { parentOrgId: id },
      take: 1,
    });

    if (children.length > 0) {
      throw new BadRequestException(
        'Impossible de supprimer cette organisation car elle a des organisations enfants',
      );
    }

    await this.organizationsRepo.delete(id);
  }

  /**
   * Retourne toutes les organisations en structure hiérarchique (arbre)
   * Chaque organisation contient un tableau `children` avec ses sous-organisations
   */
  async getOrganizationTree(): Promise<OrganizationTreeNode[]> {
    // Charger toutes les organisations actives
    const allOrgs = await this.organizationsRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    // Créer un map pour accès rapide par ID
    const orgMap = new Map<string, OrganizationTreeNode>();
    const treeNodes: OrganizationTreeNode[] = [];

    // Première passe: créer tous les noeuds
    for (const org of allOrgs) {
      const node: OrganizationTreeNode = {
        id: org.id,
        name: org.name,
        nameCode: org.nameCode,
        country: org.country,
        city: org.city,
        isRootOrganization: org.isRootOrganization,
        parentOrgId: org.parentOrgId,
        children: [],
      };
      orgMap.set(org.id, node);
    }

    // Deuxième passe: construire l'arbre
    for (const org of allOrgs) {
      const node = orgMap.get(org.id)!;
      if (org.parentOrgId && orgMap.has(org.parentOrgId)) {
        // Ajouter comme enfant de son parent
        const parent = orgMap.get(org.parentOrgId)!;
        parent.children.push(node);
      } else {
        // Organisation racine (pas de parent ou parent introuvable)
        treeNodes.push(node);
      }
    }

    // Trier les enfants par nom
    const sortChildren = (nodes: OrganizationTreeNode[]): OrganizationTreeNode[] => {
      for (const node of nodes) {
        node.children = sortChildren(node.children);
      }
      return nodes.sort((a, b) => a.name.localeCompare(b.name));
    };

    return sortChildren(treeNodes);
  }

  /**
   * Retourne le sous-arbre à partir d'une organisation donnée
   */
  async getSubTree(organizationId: string): Promise<OrganizationTreeNode | null> {
    const allOrgs = await this.organizationsRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    const orgMap = new Map<string, OrganizationTreeNode>();

    // Première passe: créer tous les noeuds
    for (const org of allOrgs) {
      const node: OrganizationTreeNode = {
        id: org.id,
        name: org.name,
        nameCode: org.nameCode,
        country: org.country,
        city: org.city,
        isRootOrganization: org.isRootOrganization,
        parentOrgId: org.parentOrgId,
        children: [],
      };
      orgMap.set(org.id, node);
    }

    // Vérifier si l'organisation demandée existe
    const targetNode = orgMap.get(organizationId);
    if (!targetNode) {
      return null;
    }

    // Deuxième passe: construire les relations parent-enfant
    for (const org of allOrgs) {
      const node = orgMap.get(org.id)!;
      if (org.parentOrgId && orgMap.has(org.parentOrgId)) {
        const parent = orgMap.get(org.parentOrgId)!;
        parent.children.push(node);
      }
    }

    // Trier les enfants récursivement
    const sortChildren = (node: OrganizationTreeNode): OrganizationTreeNode => {
      node.children = node.children.map(sortChildren).sort((a, b) => a.name.localeCompare(b.name));
      return node;
    };

    return sortChildren(targetNode);
  }
}

/**
 * Interface pour un noeud de l'arbre d'organisations
 */
export interface OrganizationTreeNode {
  id: string;
  name: string;
  nameCode: string | null;
  country: string;
  city: string | null;
  isRootOrganization: boolean;
  parentOrgId: string | null;
  children: OrganizationTreeNode[];
}
