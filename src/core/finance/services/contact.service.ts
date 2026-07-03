import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact, ContactStatus } from '../entities/contact.entity';

export interface CreateContactInput {
  contactTypeId?: string | null;
  categoryId?: string | null;
  isCustomer?: boolean;
  isSupplier?: boolean;
  isPartner?: boolean;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  paymentTermsDays?: number;
  assignedTo?: string | null;
  customerStatus?: ContactStatus;
}

export type UpdateContactInput = Partial<CreateContactInput> & {
  isActive?: boolean;
};

export interface ListContactsOptions {
  page?: number;
  limit?: number;
  search?: string;
  role?: 'customer' | 'supplier' | 'partner';
  status?: ContactStatus;
  includeInactive?: boolean;
}

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(Contact)
    private readonly repo: Repository<Contact>,
  ) {}

  async findPage(organizationId: string, options: ListContactsOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 25;

    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.contactType', 'contactType')
      .leftJoinAndSelect('c.category', 'category')
      .leftJoinAndSelect('c.assignee', 'assignee')
      .where('c.organization_id = :orgId', { orgId: organizationId })
      .andWhere('c.deleted_at IS NULL');

    if (!options.includeInactive) {
      qb.andWhere('c.is_active = true');
    }

    if (options.role === 'customer') qb.andWhere('c.is_customer = true');
    if (options.role === 'supplier') qb.andWhere('c.is_supplier = true');
    if (options.role === 'partner') qb.andWhere('c.is_partner = true');

    if (options.status) {
      qb.andWhere('c.customer_status = :status', { status: options.status });
    }

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(COALESCE(c.company_name, \'\')) LIKE :term OR LOWER(COALESCE(c.first_name, \'\')) LIKE :term OR LOWER(COALESCE(c.last_name, \'\')) LIKE :term OR LOWER(COALESCE(c.email, \'\')) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('c.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items,
      meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 },
    };
  }

  async findOne(organizationId: string, id: string): Promise<Contact> {
    const contact = await this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.contactType', 'contactType')
      .leftJoinAndSelect('c.category', 'category')
      .leftJoinAndSelect('c.assignee', 'assignee')
      .where('c.id = :id', { id })
      .andWhere('c.organization_id = :orgId', { orgId: organizationId })
      .andWhere('c.deleted_at IS NULL')
      .getOne();

    if (!contact) throw new NotFoundException('Contact introuvable');
    return contact;
  }

  async create(organizationId: string, actorId: string | null, input: CreateContactInput): Promise<Contact> {
    this.validateIdentity(input);

    const contact = this.repo.create({
      organizationId,
      contactTypeId: input.contactTypeId ?? null,
      categoryId: input.categoryId ?? null,
      isCustomer: input.isCustomer ?? false,
      isSupplier: input.isSupplier ?? false,
      isPartner: input.isPartner ?? false,
      companyName: this.cleanString(input.companyName),
      firstName: this.cleanString(input.firstName),
      lastName: this.cleanString(input.lastName),
      email: this.cleanEmail(input.email),
      phone: this.cleanString(input.phone),
      city: this.cleanString(input.city),
      country: this.cleanString(input.country),
      paymentTermsDays: this.clampPaymentTerms(input.paymentTermsDays),
      assignedTo: input.assignedTo ?? null,
      customerStatus: input.customerStatus ?? 'active',
      isActive: true,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return this.repo.save(contact);
  }

  async update(organizationId: string, id: string, actorId: string | null, input: UpdateContactInput): Promise<Contact> {
    const contact = await this.findOne(organizationId, id);

    const merged: CreateContactInput = {
      contactTypeId: input.contactTypeId ?? contact.contactTypeId,
      categoryId: input.categoryId ?? contact.categoryId,
      isCustomer: input.isCustomer ?? contact.isCustomer,
      isSupplier: input.isSupplier ?? contact.isSupplier,
      isPartner: input.isPartner ?? contact.isPartner,
      companyName: input.companyName ?? contact.companyName,
      firstName: input.firstName ?? contact.firstName,
      lastName: input.lastName ?? contact.lastName,
      email: input.email ?? contact.email,
      phone: input.phone ?? contact.phone,
      city: input.city ?? contact.city,
      country: input.country ?? contact.country,
      paymentTermsDays: input.paymentTermsDays ?? contact.paymentTermsDays,
      assignedTo: input.assignedTo ?? contact.assignedTo,
      customerStatus: input.customerStatus ?? contact.customerStatus,
    };
    this.validateIdentity(merged);

    Object.assign(contact, {
      ...merged,
      companyName: this.cleanString(merged.companyName),
      firstName: this.cleanString(merged.firstName),
      lastName: this.cleanString(merged.lastName),
      email: this.cleanEmail(merged.email),
      phone: this.cleanString(merged.phone),
      city: this.cleanString(merged.city),
      country: this.cleanString(merged.country),
      paymentTermsDays: this.clampPaymentTerms(merged.paymentTermsDays),
      isActive: input.isActive ?? contact.isActive,
      updatedBy: actorId,
    });
    return this.repo.save(contact);
  }

  async softDelete(organizationId: string, id: string, actorId: string | null): Promise<void> {
    const contact = await this.findOne(organizationId, id);
    await this.repo.update(
      { id: contact.id },
      {
        deletedAt: new Date(),
        updatedBy: actorId,
        isActive: false,
      } as any,
    );
  }

  private validateIdentity(input: CreateContactInput): void {
    const hasCompany = !!input.companyName?.trim();
    const hasPerson = !!(input.firstName?.trim() || input.lastName?.trim());
    if (!hasCompany && !hasPerson) {
      throw new BadRequestException("Renseignez au moins la raison sociale ou un nom/prénom");
    }
    if (!input.isCustomer && !input.isSupplier && !input.isPartner) {
      throw new BadRequestException('Sélectionnez au moins un rôle : client, fournisseur ou partenaire');
    }
    if (input.email && !this.isValidEmail(input.email)) {
      throw new BadRequestException("Adresse email invalide");
    }
  }

  private cleanString(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private cleanEmail(value: string | null | undefined): string | null {
    const trimmed = this.cleanString(value);
    return trimmed ? trimmed.toLowerCase() : null;
  }

  private clampPaymentTerms(value: number | undefined): number {
    if (value === undefined || value === null) return 30;
    if (!Number.isFinite(value) || value < 0) return 0;
    if (value > 365) return 365;
    return Math.floor(value);
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}
