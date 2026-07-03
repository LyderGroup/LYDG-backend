import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Payment, PaymentMethod, PaymentStatus } from '../entities/payment.entity';
import { Invoice } from '../entities/invoice.entity';

export interface CreatePaymentInput {
  invoiceId?: string | null;
  contactId?: string | null;
  paymentDate?: string | null; // défaut : aujourd'hui
  amount: number;
  currency?: string;
  paymentMethod?: PaymentMethod | null;
  status?: PaymentStatus;
}

export interface UpdatePaymentInput {
  paymentDate?: string | null;
  amount?: number;
  currency?: string;
  paymentMethod?: PaymentMethod | null;
  status?: PaymentStatus;
}

export interface ListPaymentsOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: PaymentStatus;
  invoiceId?: string;
  contactId?: string;
  from?: string;
  to?: string;
}

/**
 * Service Paiements.
 *
 * Important : la table `module_d_finance.payments` est soumise au trigger
 * `recompute_invoice_paid_amount()` (cf. module_d_finance_v2.sql) qui met
 * automatiquement à jour `invoices.paid_amount` à chaque INSERT/UPDATE/DELETE
 * pour les paiements de statut `received` ou `reconciled`. Ce service ne
 * recalcule donc PAS manuellement le paid_amount — il se contente de propager
 * le statut de la facture (sent → partial → paid) après mutation.
 */
@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Lecture ────────────────────────────────────────────────────────────
  async findPage(organizationId: string, options: ListPaymentsOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 25;

    const qb = this.payments
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.invoice', 'invoice')
      .leftJoinAndSelect('p.contact', 'contact')
      .where('p.organization_id = :orgId', { orgId: organizationId })
      .andWhere('p.deleted_at IS NULL');

    if (options.status) qb.andWhere('p.status = :status', { status: options.status });
    if (options.invoiceId) qb.andWhere('p.invoice_id = :iid', { iid: options.invoiceId });
    if (options.contactId) qb.andWhere('p.contact_id = :cid', { cid: options.contactId });
    if (options.from) qb.andWhere('p.payment_date >= :from', { from: options.from });
    if (options.to) qb.andWhere('p.payment_date <= :to', { to: options.to });

    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(p.payment_number) LIKE :term OR LOWER(COALESCE(invoice.invoice_number, \'\')) LIKE :term OR LOWER(COALESCE(contact.company_name, \'\')) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('p.paymentDate', 'DESC')
      .addOrderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items,
      meta: { total, page, limit, pageCount: Math.ceil(total / limit) || 1 },
    };
  }

  async findOne(organizationId: string, id: string): Promise<Payment> {
    const payment = await this.payments
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.invoice', 'invoice')
      .leftJoinAndSelect('p.contact', 'contact')
      .where('p.id = :id', { id })
      .andWhere('p.organization_id = :orgId', { orgId: organizationId })
      .andWhere('p.deleted_at IS NULL')
      .getOne();

    if (!payment) throw new NotFoundException('Paiement introuvable');
    return payment;
  }

  // ─── Création ───────────────────────────────────────────────────────────
  async create(organizationId: string, actorId: string | null, input: CreatePaymentInput): Promise<Payment> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('Le montant doit être strictement positif');
    }
    if (!input.invoiceId && !input.contactId) {
      throw new BadRequestException('Rattachez le paiement à une facture ou à un contact');
    }

    return this.dataSource.transaction(async (em) => {
      let inheritedContactId: string | null = input.contactId ?? null;
      let inheritedCurrency: string | null = null;

      if (input.invoiceId) {
        const invoice = await em.getRepository(Invoice).findOne({
          where: { id: input.invoiceId, organizationId },
        });
        if (!invoice || invoice.deletedAt) throw new BadRequestException('Facture introuvable');
        if (invoice.status === 'cancelled') {
          throw new ForbiddenException('Impossible de payer une facture annulée');
        }
        if (invoice.status === 'draft') {
          throw new ForbiddenException("Émettez d'abord la facture avant d'enregistrer un paiement");
        }
        inheritedContactId = inheritedContactId ?? invoice.contactId;
        inheritedCurrency = invoice.currency;

        // Le surpaiement est interdit par le CHECK SQL `paid_amount <= total_amount`.
        // On vérifie ici en amont pour renvoyer une 400 claire au client.
        const newPaid = Number(invoice.paidAmount ?? 0) + this.round2(input.amount);
        if (newPaid > Number(invoice.totalAmount ?? 0) + 0.005) {
          throw new BadRequestException(
            `Montant supérieur au reste dû (${Number(invoice.totalAmount) - Number(invoice.paidAmount)})`,
          );
        }
      }

      const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
      const number = await this.generatePaymentNumber(em, organizationId, paymentDate);

      const payment = em.getRepository(Payment).create({
        organizationId,
        invoiceId: input.invoiceId ?? null,
        contactId: inheritedContactId,
        paymentNumber: number,
        paymentDate,
        amount: this.round2(input.amount),
        currency: (input.currency ?? inheritedCurrency ?? 'XOF').toUpperCase(),
        paymentMethod: input.paymentMethod ?? null,
        status: input.status ?? 'received',
        createdBy: actorId,
        updatedBy: actorId,
      });
      const saved = await em.getRepository(Payment).save(payment);

      // Le trigger SQL a recalculé paid_amount. On remonte le statut métier.
      if (input.invoiceId) {
        await this.syncInvoiceStatus(em, input.invoiceId);
      }

      return em.getRepository(Payment).findOneOrFail({
        where: { id: saved.id },
        relations: ['invoice', 'contact'],
      });
    });
  }

  // ─── Mise à jour ────────────────────────────────────────────────────────
  async update(organizationId: string, id: string, actorId: string | null, input: UpdatePaymentInput): Promise<Payment> {
    return this.dataSource.transaction(async (em) => {
      const payment = await em.getRepository(Payment).findOne({
        where: { id, organizationId },
      });
      if (!payment || payment.deletedAt) throw new NotFoundException('Paiement introuvable');

      const patch: Partial<Payment> = { updatedBy: actorId };
      if (input.paymentDate) patch.paymentDate = new Date(input.paymentDate);
      if (input.amount !== undefined) {
        if (!Number.isFinite(input.amount) || input.amount <= 0) {
          throw new BadRequestException('Montant invalide');
        }
        patch.amount = this.round2(input.amount);
      }
      if (input.currency) patch.currency = input.currency.toUpperCase();
      if (input.paymentMethod !== undefined) patch.paymentMethod = input.paymentMethod;
      if (input.status) patch.status = input.status;

      // Si on modifie un paiement rattaché à une facture, on revalide le total
      if (payment.invoiceId && (input.amount !== undefined || input.status)) {
        const invoice = await em.getRepository(Invoice).findOne({ where: { id: payment.invoiceId } });
        if (invoice) {
          const otherPaid = await em
            .getRepository(Payment)
            .createQueryBuilder('p')
            .where('p.invoice_id = :iid', { iid: payment.invoiceId })
            .andWhere('p.id != :pid', { pid: id })
            .andWhere('p.deleted_at IS NULL')
            .andWhere('p.status IN (:...statuses)', { statuses: ['received', 'reconciled'] })
            .select('COALESCE(SUM(p.amount), 0)', 'sum')
            .getRawOne<{ sum: string }>();

          const otherSum = Number(otherPaid?.sum ?? 0);
          const nextStatus = patch.status ?? payment.status;
          const nextAmount = patch.amount ?? payment.amount;
          const willContribute = ['received', 'reconciled'].includes(nextStatus);
          const projected = otherSum + (willContribute ? Number(nextAmount) : 0);

          if (projected > Number(invoice.totalAmount ?? 0) + 0.005) {
            throw new BadRequestException(
              `Le total des paiements (${projected}) dépasserait le montant de la facture (${invoice.totalAmount})`,
            );
          }
        }
      }

      await em.getRepository(Payment).update({ id }, patch as any);

      if (payment.invoiceId) {
        await this.syncInvoiceStatus(em, payment.invoiceId);
      }

      return em.getRepository(Payment).findOneOrFail({
        where: { id },
        relations: ['invoice', 'contact'],
      });
    });
  }

  // ─── Rapprochement ──────────────────────────────────────────────────────
  async reconcile(organizationId: string, id: string, actorId: string | null): Promise<Payment> {
    const payment = await this.findOne(organizationId, id);
    if (payment.status === 'reconciled') return payment;
    if (payment.status === 'cancelled' || payment.status === 'refunded') {
      throw new ForbiddenException("Impossible de rapprocher un paiement annulé/remboursé");
    }
    await this.payments.update({ id }, { status: 'reconciled', updatedBy: actorId } as any);
    if (payment.invoiceId) {
      await this.dataSource.transaction((em) => this.syncInvoiceStatus(em, payment.invoiceId as string));
    }
    return this.findOne(organizationId, id);
  }

  // ─── Suppression (logique) ──────────────────────────────────────────────
  async softDelete(organizationId: string, id: string, actorId: string | null): Promise<void> {
    const payment = await this.findOne(organizationId, id);
    if (payment.status === 'reconciled') {
      throw new ForbiddenException('Annulez le rapprochement avant suppression');
    }
    await this.payments.update(
      { id },
      { deletedAt: new Date(), status: 'cancelled', updatedBy: actorId } as any,
    );
    // Le trigger SQL exclut les paiements deleted_at IS NOT NULL ? Non,
    // il filtre seulement sur status IN (received, reconciled). On force donc
    // le status à 'cancelled' juste avant pour exclure ce paiement du total.
    if (payment.invoiceId) {
      await this.dataSource.transaction((em) => this.syncInvoiceStatus(em, payment.invoiceId as string));
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────
  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private async generatePaymentNumber(em: any, organizationId: string, paymentDate: Date): Promise<string> {
    const year = paymentDate.getUTCFullYear();
    const prefix = `PAY-${year}-`;
    const row = await em.query(
      `SELECT payment_number FROM module_d_finance.payments
        WHERE organization_id = $1 AND payment_number LIKE $2
        ORDER BY payment_number DESC LIMIT 1`,
      [organizationId, `${prefix}%`],
    );
    const last = row?.[0]?.payment_number ?? null;
    const lastSeq = last ? parseInt(String(last).slice(prefix.length), 10) || 0 : 0;
    const next = (lastSeq + 1).toString().padStart(5, '0');
    return `${prefix}${next}`;
  }

  /**
   * Synchronise `invoices.status` (sent / partial / paid) en fonction de
   * `paid_amount` recalculé par le trigger SQL. Conservée côté service car
   * c'est une règle métier (et non un invariant comptable).
   */
  private async syncInvoiceStatus(em: any, invoiceId: string): Promise<void> {
    const invoice = await em.getRepository(Invoice).findOne({ where: { id: invoiceId } });
    if (!invoice) return;
    if (invoice.status === 'cancelled' || invoice.status === 'draft') return;

    const total = Number(invoice.totalAmount ?? 0);
    const paid = Number(invoice.paidAmount ?? 0);

    let next = invoice.status;
    if (paid >= total - 0.005 && total > 0) {
      next = 'paid';
    } else if (paid > 0) {
      next = 'partial';
    } else {
      // Si tous les paiements ont été annulés/supprimés
      next = 'sent';
    }

    if (next !== invoice.status) {
      await em.getRepository(Invoice).update({ id: invoiceId }, { status: next } as any);
    }
  }
}
