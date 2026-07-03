import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';

export interface InvoiceItemInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateInvoiceInput {
  contactId: string;
  projectId?: string | null;
  issueDate?: string | null; // ISO date — défaut = aujourd'hui
  dueDate?: string | null; // si absent : issueDate + paymentTermsDays du contact
  currency?: string;
  taxAmount?: number;
  items: InvoiceItemInput[];
}

export interface UpdateInvoiceInput {
  contactId?: string;
  projectId?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  currency?: string;
  taxAmount?: number;
  items?: InvoiceItemInput[]; // si fourni : remplace l'intégralité des lignes
}

export interface ListInvoicesOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: InvoiceStatus;
  contactId?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class InvoiceService {
  constructor(
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(InvoiceItem) private readonly items: Repository<InvoiceItem>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Lecture ────────────────────────────────────────────────────────────
  async findPage(organizationId: string, options: ListInvoicesOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 25;

    const qb = this.invoices
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.contact', 'contact')
      .where('inv.organization_id = :orgId', { orgId: organizationId })
      .andWhere('inv.deleted_at IS NULL');

    if (options.status) qb.andWhere('inv.status = :status', { status: options.status });
    if (options.contactId) qb.andWhere('inv.contact_id = :cid', { cid: options.contactId });
    if (options.from) qb.andWhere('inv.issue_date >= :from', { from: options.from });
    if (options.to) qb.andWhere('inv.issue_date <= :to', { to: options.to });

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(inv.invoice_number) LIKE :term OR LOWER(COALESCE(contact.company_name, \'\')) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('inv.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items,
      meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 },
    };
  }

  async findOne(organizationId: string, id: string): Promise<Invoice> {
    const invoice = await this.invoices
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.contact', 'contact')
      .leftJoinAndSelect('inv.items', 'items')
      .where('inv.id = :id', { id })
      .andWhere('inv.organization_id = :orgId', { orgId: organizationId })
      .andWhere('inv.deleted_at IS NULL')
      .getOne();

    if (!invoice) throw new NotFoundException('Facture introuvable');
    return invoice;
  }

  // ─── Création ───────────────────────────────────────────────────────────
  async create(organizationId: string, actorId: string | null, input: CreateInvoiceInput): Promise<Invoice> {
    this.validateItems(input.items);

    return this.dataSource.transaction(async (em) => {
      // Récupération des conditions de paiement du contact si dueDate absent
      const issueDate = input.issueDate ? new Date(input.issueDate) : new Date();
      let dueDate: Date;
      if (input.dueDate) {
        dueDate = new Date(input.dueDate);
      } else {
        const row = await em.query(
          `SELECT payment_terms_days FROM module_d_finance.contacts WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
          [input.contactId, organizationId],
        );
        if (!row?.length) throw new BadRequestException('Contact introuvable pour cette organisation');
        const days = Number(row[0].payment_terms_days) || 30;
        dueDate = new Date(issueDate.getTime());
        dueDate.setDate(dueDate.getDate() + days);
      }

      if (dueDate < this.startOfDay(issueDate)) {
        throw new BadRequestException("La date d'échéance doit être >= date d'émission");
      }

      const number = await this.generateInvoiceNumber(em, organizationId, issueDate);

      const totals = this.computeTotals(input.items, input.taxAmount ?? 0);

      const invRepo = em.getRepository(Invoice);
      const invoice = invRepo.create({
        organizationId,
        contactId: input.contactId,
        projectId: input.projectId ?? null,
        invoiceNumber: number,
        issueDate,
        dueDate,
        currency: (input.currency ?? 'XOF').toUpperCase(),
        status: 'draft',
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        paidAmount: 0,
        createdBy: actorId,
        updatedBy: actorId,
      });
      const saved = await invRepo.save(invoice);

      const itemRepo = em.getRepository(InvoiceItem);
      const rows = input.items.map((it) =>
        itemRepo.create({
          invoiceId: saved.id,
          productId: it.productId ?? null,
          description: it.description.trim(),
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: this.lineTotal(it.quantity, it.unitPrice),
        }),
      );
      await itemRepo.save(rows);

      return this.findOneWithEm(em, organizationId, saved.id);
    });
  }

  // ─── Mise à jour (uniquement si draft) ─────────────────────────────────
  async update(organizationId: string, id: string, actorId: string | null, input: UpdateInvoiceInput): Promise<Invoice> {
    return this.dataSource.transaction(async (em) => {
      const invoice = await em.getRepository(Invoice).findOne({
        where: { id, organizationId },
      });
      if (!invoice || invoice.deletedAt) throw new NotFoundException('Facture introuvable');
      if (invoice.status !== 'draft') {
        throw new ForbiddenException("Seules les factures en brouillon peuvent être modifiées. Annulez ou créez un avoir.");
      }

      const patch: Partial<Invoice> = {};
      if (input.contactId) patch.contactId = input.contactId;
      if (input.projectId !== undefined) patch.projectId = input.projectId;
      if (input.issueDate) patch.issueDate = new Date(input.issueDate);
      if (input.dueDate) patch.dueDate = new Date(input.dueDate);
      if (input.currency) patch.currency = input.currency.toUpperCase();

      const issueDate = patch.issueDate ?? invoice.issueDate;
      const dueDate = patch.dueDate ?? invoice.dueDate;
      if (new Date(dueDate) < this.startOfDay(new Date(issueDate))) {
        throw new BadRequestException("La date d'échéance doit être >= date d'émission");
      }

      // Recalcul des totaux si lignes ou taxAmount changent
      let itemsForRecompute: InvoiceItemInput[] | null = null;
      if (input.items !== undefined) {
        this.validateItems(input.items);
        itemsForRecompute = input.items;
      } else {
        const existing = await em.getRepository(InvoiceItem).find({ where: { invoiceId: id } });
        itemsForRecompute = existing.map((e) => ({
          productId: e.productId,
          description: e.description,
          quantity: e.quantity,
          unitPrice: e.unitPrice,
        }));
      }
      const taxAmount = input.taxAmount ?? invoice.taxAmount ?? 0;
      const totals = this.computeTotals(itemsForRecompute, taxAmount);
      patch.subtotal = totals.subtotal;
      patch.taxAmount = totals.taxAmount;
      patch.totalAmount = totals.totalAmount;
      patch.updatedBy = actorId;

      await em.getRepository(Invoice).update({ id }, patch as any);

      // Remplace les lignes si fournies
      if (input.items !== undefined) {
        await em.getRepository(InvoiceItem).delete({ invoiceId: id });
        const itemRepo = em.getRepository(InvoiceItem);
        const rows = input.items.map((it) =>
          itemRepo.create({
            invoiceId: id,
            productId: it.productId ?? null,
            description: it.description.trim(),
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            lineTotal: this.lineTotal(it.quantity, it.unitPrice),
          }),
        );
        await itemRepo.save(rows);
      }

      return this.findOneWithEm(em, organizationId, id);
    });
  }

  // ─── Transitions ────────────────────────────────────────────────────────
  async issue(organizationId: string, id: string, actorId: string | null): Promise<Invoice> {
    const invoice = await this.findOne(organizationId, id);
    if (invoice.status !== 'draft') {
      throw new ForbiddenException('Seules les factures en brouillon peuvent être émises');
    }
    if (!invoice.items || invoice.items.length === 0) {
      throw new BadRequestException('Une facture ne peut pas être émise sans lignes');
    }
    await this.invoices.update({ id }, { status: 'sent', updatedBy: actorId } as any);
    return this.findOne(organizationId, id);
  }

  async cancel(organizationId: string, id: string, actorId: string | null): Promise<Invoice> {
    const invoice = await this.findOne(organizationId, id);
    if (invoice.status === 'paid') {
      throw new ForbiddenException('Impossible d\'annuler une facture déjà payée. Créez un avoir.');
    }
    if (invoice.status === 'cancelled') return invoice;
    await this.invoices.update({ id }, { status: 'cancelled', updatedBy: actorId } as any);
    return this.findOne(organizationId, id);
  }

  async softDelete(organizationId: string, id: string, actorId: string | null): Promise<void> {
    const invoice = await this.findOne(organizationId, id);
    if (!['draft', 'cancelled'].includes(invoice.status)) {
      throw new ForbiddenException('Seules les factures en brouillon ou annulées peuvent être supprimées');
    }
    await this.invoices.update(
      { id },
      { deletedAt: new Date(), updatedBy: actorId } as any,
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────────
  private validateItems(items: InvoiceItemInput[]): void {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Au moins une ligne est obligatoire');
    }
    for (const it of items) {
      if (!it.description?.trim()) throw new BadRequestException('Chaque ligne nécessite une description');
      if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
        throw new BadRequestException('Quantité invalide');
      }
      if (!Number.isFinite(it.unitPrice) || it.unitPrice < 0) {
        throw new BadRequestException('Prix unitaire invalide');
      }
    }
  }

  private lineTotal(qty: number, unit: number): number {
    return this.round2(qty * unit);
  }

  private computeTotals(items: InvoiceItemInput[], taxAmount: number): { subtotal: number; taxAmount: number; totalAmount: number } {
    const subtotal = this.round2(items.reduce((s, it) => s + this.lineTotal(it.quantity, it.unitPrice), 0));
    const tax = this.round2(Math.max(0, taxAmount || 0));
    return { subtotal, taxAmount: tax, totalAmount: this.round2(subtotal + tax) };
  }

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  /**
   * Génère un numéro de facture unique par organisation + année.
   * Format : `INV-{YYYY}-{seq:05}` (ex: `INV-2026-00042`).
   *
   * Concurrence : on prend le MAX(numéro) existant + 1 ; un échec lors du
   * INSERT (uq_invoices_org_number) sera levé jusqu'à l'appelant et déclenchera
   * un retry côté client si nécessaire. À terme : table de séquence dédiée.
   */
  private async generateInvoiceNumber(em: any, organizationId: string, issueDate: Date): Promise<string> {
    const year = issueDate.getUTCFullYear();
    const prefix = `INV-${year}-`;
    const row = await em.query(
      `SELECT invoice_number FROM module_d_finance.invoices
        WHERE organization_id = $1 AND invoice_number LIKE $2
        ORDER BY invoice_number DESC
        LIMIT 1`,
      [organizationId, `${prefix}%`],
    );
    const last = row?.[0]?.invoice_number ?? null;
    const lastSeq = last ? parseInt(String(last).slice(prefix.length), 10) || 0 : 0;
    const next = (lastSeq + 1).toString().padStart(5, '0');
    return `${prefix}${next}`;
  }

  private async findOneWithEm(em: any, organizationId: string, id: string): Promise<Invoice> {
    const row = await em
      .getRepository(Invoice)
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.contact', 'contact')
      .leftJoinAndSelect('inv.items', 'items')
      .where('inv.id = :id', { id })
      .andWhere('inv.organization_id = :orgId', { orgId: organizationId })
      .getOne();
    if (!row) throw new NotFoundException('Facture introuvable');
    return row;
  }
}
