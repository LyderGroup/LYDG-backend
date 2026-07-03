import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, IsNull } from 'typeorm';
import { EmployeeRequiredDocument, DocumentStatus } from './employee-required-document.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { NotificationType } from '../notifications/notification.entity';

@Injectable()
export class DocumentReminderService {
  private readonly logger = new Logger(DocumentReminderService.name);

  constructor(
    @InjectRepository(EmployeeRequiredDocument)
    private documentsRepo: Repository<EmployeeRequiredDocument>,
    private notificationService: InAppNotificationService,
  ) { }

  /**
   * Envoi de rappels quotidiens à 9h00
   */
  @Cron('0 9 * * *') // Tous les jours à 9h
  async sendDailyReminders() {
    this.logger.log('Starting daily document reminders...');

    const documents = await this.getDocumentsNeedingReminder();

    for (const doc of documents) {
      await this.sendReminderForDocument(doc);
    }

    this.logger.log(`Sent ${documents.length} document reminders`);
  }

  /**
   * Récupérer les documents nécessitant un rappel
   */
  private async getDocumentsNeedingReminder(): Promise<EmployeeRequiredDocument[]> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Documents non fournis (pas encore uploadés)
    return this.documentsRepo.find({
      where: [
        {
          status: In([DocumentStatus.PENDING, DocumentStatus.REJECTED]),
          reminderSentAt: LessThan(yesterday) || IsNull(),
        },
      ],
      relations: ['employee'],
    });
  }

  /**
   * Envoyer un rappel pour un document
   */
  private async sendReminderForDocument(doc: EmployeeRequiredDocument): Promise<void> {
    const employee = doc.employee;
    if (!employee || !employee.userId) {
      return;
    }

    const title = `Document à fournir: ${this.getDocumentDisplayName(doc.documentType)}`;
    const message = `Veuillez fournir votre document "${this.getDocumentDisplayName(doc.documentType)}" pour compléter votre dossier.`;

    await this.notificationService.create({
      userId: employee.userId!,
      type: 'deadline_reminder' as any,
      title,
      message,
      data: {
        documentId: doc.id,
        documentType: doc.documentType,
      },
      organizationId: doc.organizationId,
    });

    // Marquer le rappel comme envoyé
    await this.documentsRepo.update(doc.id, {
      reminderSentAt: new Date(),
    });
  }

  /**
   * Formater le nom du document
   */
  private getDocumentDisplayName(type: string): string {
    const names: Record<string, string> = {
      birth_certificate: 'Acte de naissance',
      id_photo: 'Photo d\'identité',
      id_copy: 'Copie pièce d\'identité',
      cv: 'CV',
      cover_letter: 'Lettre de motivation',
      diploma: 'Diplômes',
      work_certificate: 'Certificats de travail',
      criminal_record: 'Casier judiciaire',
      cnss_number: 'Numéro CNSS',
      info_form: 'Fiche de renseignement',
    };
    return names[type] || type;
  }

  /**
   * Formater une date
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
