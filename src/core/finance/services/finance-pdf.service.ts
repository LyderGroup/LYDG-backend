import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Invoice } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import { Contact } from '../entities/contact.entity';

type PdfDoc = InstanceType<typeof PDFDocument>;

const ACCENT = '#f09815';
const MUTED = '#666';
const BORDER = '#ddd';

@Injectable()
export class FinancePdfService {
  // ─── Facture ───────────────────────────────────────────────────────────────
  async renderInvoice(invoice: Invoice): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk as Buffer));

    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    // En-tête
    this.drawHeader(doc, 'FACTURE', invoice.invoiceNumber);

    // Bloc client
    const contact = invoice.contact;
    doc.moveDown(1);
    doc.fontSize(10).fillColor(MUTED).text('Destinataire', { continued: false });
    doc.fontSize(11).fillColor('#000');
    if (contact) {
      const name = contact.companyName ||
        [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
        '—';
      doc.text(name);
      if (contact.email) doc.text(contact.email);
      if (contact.phone) doc.text(contact.phone);
      if (contact.city || contact.country) {
        doc.text([contact.city, contact.country].filter(Boolean).join(', '));
      }
    } else {
      doc.text('—');
    }

    // Bloc dates
    doc.moveDown(1);
    const blockY = doc.y;
    doc.fontSize(10).fillColor(MUTED).text('Date d\'émission', 48, blockY);
    doc.fillColor('#000').fontSize(11).text(this.formatDate(invoice.issueDate), 48, blockY + 12);

    doc.fontSize(10).fillColor(MUTED).text('Date d\'échéance', 220, blockY);
    doc.fillColor('#000').fontSize(11).text(this.formatDate(invoice.dueDate), 220, blockY + 12);

    doc.fontSize(10).fillColor(MUTED).text('Statut', 380, blockY);
    doc.fillColor('#000').fontSize(11).text(this.statusLabel(invoice.status), 380, blockY + 12);

    doc.moveDown(3);

    // Tableau lignes
    this.drawItemsTable(doc, invoice);

    // Totaux
    this.drawTotals(doc, invoice);

    // Pied
    this.drawFooter(doc);

    doc.end();
    return finished;
  }

  // ─── Paiement ──────────────────────────────────────────────────────────────
  async renderPayment(payment: Payment): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk as Buffer));

    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.drawHeader(doc, 'REÇU DE PAIEMENT', payment.paymentNumber);

    doc.moveDown(1);

    if (payment.contact) {
      const c = payment.contact;
      const name = c.companyName ||
        [c.firstName, c.lastName].filter(Boolean).join(' ').trim() ||
        '—';
      doc.fontSize(10).fillColor(MUTED).text('De');
      doc.fontSize(11).fillColor('#000').text(name);
      if (c.email) doc.text(c.email);
    }

    doc.moveDown(1.5);

    // Bloc principal
    const tx = 48;
    let y = doc.y;
    const line = (label: string, value: string) => {
      doc.fontSize(10).fillColor(MUTED).text(label, tx, y);
      doc.fontSize(12).fillColor('#000').text(value, tx + 200, y);
      y += 22;
    };

    line('Date du paiement', this.formatDate(payment.paymentDate));
    line('Montant', `${this.formatAmount(payment.amount)} ${payment.currency}`);
    line('Méthode', this.paymentMethodLabel(payment.paymentMethod));
    line('Statut', this.paymentStatusLabel(payment.status));

    if (payment.invoice) {
      line('Facture liée', payment.invoice.invoiceNumber);
    }

    doc.moveDown(2);
    this.drawFooter(doc);
    doc.end();
    return finished;
  }

  // ─── Fiche contact ─────────────────────────────────────────────────────────
  async renderContact(contact: Contact): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk as Buffer));

    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const name = contact.companyName ||
      [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
      'Contact';

    this.drawHeader(doc, 'FICHE CONTACT', name);

    doc.moveDown(1);

    const tx = 48;
    let y = doc.y;
    const line = (label: string, value: string | null) => {
      if (!value) return;
      doc.fontSize(10).fillColor(MUTED).text(label, tx, y);
      doc.fontSize(11).fillColor('#000').text(value, tx + 180, y);
      y += 20;
    };

    line('Nom / Société', name);
    if (contact.companyName && (contact.firstName || contact.lastName)) {
      line('Contact', [contact.firstName, contact.lastName].filter(Boolean).join(' '));
    }
    line('Email', contact.email);
    line('Téléphone', contact.phone);
    line('Ville', contact.city);
    line('Pays', contact.country);

    const roles: string[] = [];
    if (contact.isCustomer) roles.push('Client');
    if (contact.isSupplier) roles.push('Fournisseur');
    if (contact.isPartner) roles.push('Partenaire');
    if (roles.length) line('Type', roles.join(', '));

    line('Conditions de paiement', `${contact.paymentTermsDays} jours`);
    line('Statut', contact.isActive ? 'Actif' : 'Inactif');

    doc.moveDown(2);
    this.drawFooter(doc);
    doc.end();
    return finished;
  }

  // ─── Helpers de rendu ──────────────────────────────────────────────────────
  private drawHeader(doc: PdfDoc, title: string, reference: string) {
    doc
      .fillColor(ACCENT)
      .fontSize(22)
      .text(title, 48, 48, { align: 'left' });

    doc
      .fillColor('#000')
      .fontSize(13)
      .text(reference, 48, 78);

    doc
      .moveTo(48, 100)
      .lineTo(547, 100)
      .strokeColor(ACCENT)
      .lineWidth(2)
      .stroke();

    doc.moveDown(1);
  }

  private drawItemsTable(doc: PdfDoc, invoice: Invoice) {
    const tx = 48;
    let y = doc.y;

    // En-têtes
    doc.fontSize(10).fillColor(MUTED);
    doc.text('Description', tx, y);
    doc.text('Qté', 320, y, { width: 50, align: 'right' });
    doc.text('PU', 380, y, { width: 70, align: 'right' });
    doc.text('Total', 470, y, { width: 80, align: 'right' });

    y += 16;
    doc
      .moveTo(tx, y)
      .lineTo(547, y)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    y += 8;

    doc.fillColor('#000').fontSize(10);
    const items = invoice.items ?? [];
    for (const item of items) {
      const descHeight = doc.heightOfString(item.description, { width: 260 });
      doc.text(item.description, tx, y, { width: 260 });
      doc.text(this.formatAmount(item.quantity), 320, y, { width: 50, align: 'right' });
      doc.text(this.formatAmount(item.unitPrice), 380, y, { width: 70, align: 'right' });
      doc.text(this.formatAmount(item.lineTotal), 470, y, { width: 80, align: 'right' });
      y += Math.max(20, descHeight + 6);
    }

    doc.y = y + 8;
  }

  private drawTotals(doc: PdfDoc, invoice: Invoice) {
    const tx = 320;
    let y = doc.y;

    const writeRow = (label: string, value: string, bold = false) => {
      doc.fontSize(bold ? 11 : 10).fillColor(bold ? '#000' : MUTED);
      doc.text(label, tx, y, { width: 130, align: 'right' });
      doc.fontSize(bold ? 12 : 11).fillColor('#000');
      doc.text(value, tx + 140, y, { width: 90, align: 'right' });
      y += bold ? 22 : 18;
    };

    writeRow('Sous-total', `${this.formatAmount(invoice.subtotal)} ${invoice.currency}`);
    writeRow('Taxes', `${this.formatAmount(invoice.taxAmount)} ${invoice.currency}`);

    doc
      .moveTo(tx, y - 2)
      .lineTo(547, y - 2)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();
    y += 4;

    writeRow('TOTAL', `${this.formatAmount(invoice.totalAmount)} ${invoice.currency}`, true);
    if (invoice.paidAmount > 0) {
      writeRow('Payé', `${this.formatAmount(invoice.paidAmount)} ${invoice.currency}`);
      writeRow('Reste à payer', `${this.formatAmount(invoice.totalAmount - invoice.paidAmount)} ${invoice.currency}`, true);
    }

    doc.y = y + 16;
  }

  private drawFooter(doc: PdfDoc) {
    const y = doc.page.height - 60;
    doc
      .fontSize(8)
      .fillColor(MUTED)
      .text(`Généré le ${this.formatDate(new Date())}`, 48, y, { align: 'left' });
  }

  // ─── Formatters ────────────────────────────────────────────────────────────
  private formatDate(d: Date | string | null): string {
    if (!d) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private formatAmount(n: number | null): string {
    if (n == null || !Number.isFinite(n)) return '0';
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);
  }

  private statusLabel(s: string): string {
    return ({
      draft: 'Brouillon',
      sent: 'Envoyée',
      partial: 'Partiellement payée',
      paid: 'Payée',
      overdue: 'En retard',
      cancelled: 'Annulée',
    } as Record<string, string>)[s] ?? s;
  }

  private paymentStatusLabel(s: string): string {
    return ({
      pending: 'En attente',
      received: 'Reçu',
      reconciled: 'Réconcilié',
      refunded: 'Remboursé',
      cancelled: 'Annulé',
    } as Record<string, string>)[s] ?? s;
  }

  private paymentMethodLabel(m: string | null): string {
    if (!m) return '—';
    return ({
      cash: 'Espèces',
      check: 'Chèque',
      wire: 'Virement',
      card: 'Carte',
      mobile_money: 'Mobile money',
      other: 'Autre',
    } as Record<string, string>)[m] ?? m;
  }
}
