import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, IsNull, In } from 'typeorm';
import {
  EmployeeRequiredDocument,
  RequiredDocumentType,
  DocumentStatus
} from './employee-required-document.entity';
import { Employee } from './employee.entity';
import { makeStorageKey } from '../security/multer.config';
import { SupabaseStorageService } from '../storage/supabase-storage.service';

export interface RequiredDocumentConfig {
  type: RequiredDocumentType;
  displayName: string;
  description: string;
  isOptional: boolean;
  hasExpiryDate: boolean;
  maxFileSizeMB: number;
  allowedMimeTypes: string[];
  dueDaysFromHire: number; // Délai en jours à partir de l'embauche
}

// Configuration des documents obligatoires
export const REQUIRED_DOCUMENTS_CONFIG: RequiredDocumentConfig[] = [
  {
    type: RequiredDocumentType.BIRTH_CERTIFICATE,
    displayName: 'Acte de naissance (légalisée)',
    description: 'Acte de naissance légalisé',
    isOptional: false,
    hasExpiryDate: false,
    maxFileSizeMB: 5,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    dueDaysFromHire: 30,
  },
  {
    type: RequiredDocumentType.ID_PHOTO,
    displayName: 'Photo d\'identité',
    description: 'Photo d\'identité récente',
    isOptional: false,
    hasExpiryDate: false,
    maxFileSizeMB: 2,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    dueDaysFromHire: 15,
  },
  {
    type: RequiredDocumentType.ID_COPY,
    displayName: 'Copie de la pièce d\'identité',
    description: 'Copie de la CNI ou du passeport',
    isOptional: false,
    hasExpiryDate: true,
    maxFileSizeMB: 5,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    dueDaysFromHire: 15,
  },
  {
    type: RequiredDocumentType.CV,
    displayName: 'CV',
    description: 'Curriculum Vitae à jour',
    isOptional: false,
    hasExpiryDate: false,
    maxFileSizeMB: 5,
    allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    dueDaysFromHire: 7,
  },
  {
    type: RequiredDocumentType.COVER_LETTER,
    displayName: 'Lettre de motivation',
    description: 'Lettre de motivation',
    isOptional: false,
    hasExpiryDate: false,
    maxFileSizeMB: 5,
    allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    dueDaysFromHire: 7,
  },
  {
    type: RequiredDocumentType.DIPLOMA,
    displayName: 'Diplômes',
    description: 'Copies des diplômes obtenus',
    isOptional: false,
    hasExpiryDate: false,
    maxFileSizeMB: 10,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    dueDaysFromHire: 30,
  },
  {
    type: RequiredDocumentType.WORK_CERTIFICATE,
    displayName: 'Certificats de travail',
    description: 'Certificats de travail / attestations d\'expérience',
    isOptional: true,
    hasExpiryDate: false,
    maxFileSizeMB: 10,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    dueDaysFromHire: 30,
  },
  {
    type: RequiredDocumentType.CRIMINAL_RECORD,
    displayName: 'Casier judiciaire',
    description: 'Extrait du casier judiciaire (moins de 3 mois)',
    isOptional: false,
    hasExpiryDate: true,
    maxFileSizeMB: 5,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    dueDaysFromHire: 30,
  },
  {
    type: RequiredDocumentType.CNSS_NUMBER,
    displayName: 'Numéro CNSS',
    description: 'Numéro d\'affiliation CNSS (optionnel)',
    isOptional: true,
    hasExpiryDate: false,
    maxFileSizeMB: 0,
    allowedMimeTypes: [],
    dueDaysFromHire: 30,
  },
  {
    type: RequiredDocumentType.INFO_FORM,
    displayName: 'Fiche de renseignement',
    description: 'Fiche de renseignement complétée (fournie par l\'agence)',
    isOptional: false,
    hasExpiryDate: false,
    maxFileSizeMB: 5,
    allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    dueDaysFromHire: 7,
  },
];

@Injectable()
export class RequiredDocumentsService {
  private readonly logger = new Logger(RequiredDocumentsService.name);

  constructor(
    @InjectRepository(EmployeeRequiredDocument)
    private documentsRepo: Repository<EmployeeRequiredDocument>,
    @InjectRepository(Employee)
    private employeesRepo: Repository<Employee>,
    private readonly storage: SupabaseStorageService,
  ) { }

  /**
   * Initialiser les documents obligatoires pour un nouvel employé
   */
  async initializeRequiredDocuments(employeeId: string, organizationId: string, hireDate?: Date): Promise<EmployeeRequiredDocument[]> {
    const employee = await this.employeesRepo.findOne({ where: { id: employeeId } });
    if (!employee) {
      throw new NotFoundException('Employé non trouvé');
    }

    const hire = hireDate || employee.contractStartDate || new Date();
    const documents: EmployeeRequiredDocument[] = [];

    for (const config of REQUIRED_DOCUMENTS_CONFIG) {
      const dueDate = new Date(hire);
      dueDate.setDate(dueDate.getDate() + config.dueDaysFromHire);

      const doc = this.documentsRepo.create({
        employeeId,
        organizationId,
        documentType: config.type,
        status: DocumentStatus.PENDING,
        isOptional: config.isOptional,
        dueDate,
      });

      documents.push(await this.documentsRepo.save(doc));
    }

    this.logger.log(`Initialized ${documents.length} required documents for employee ${employeeId}`);
    return documents;
  }

  /**
   * Récupérer les documents obligatoires d'un employé
   */
  async getEmployeeDocuments(employeeId: string): Promise<EmployeeRequiredDocument[]> {
    return this.documentsRepo.find({
      where: { employeeId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Uploader un document - crée automatiquement le document s'il n'existe pas
   */
  async uploadDocument(
    employeeId: string,
    documentType: RequiredDocumentType,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    expiryDate?: Date,
  ): Promise<EmployeeRequiredDocument> {
    // Valider le type de fichier
    const config = REQUIRED_DOCUMENTS_CONFIG.find(c => c.type === documentType);
    if (config && config.allowedMimeTypes.length > 0) {
      if (!config.allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(`Type de fichier non autorisé. Types acceptés: ${config.allowedMimeTypes.join(', ')}`);
      }
      if (file.size > config.maxFileSizeMB * 1024 * 1024) {
        throw new BadRequestException(`Fichier trop volumineux. Maximum: ${config.maxFileSizeMB}MB`);
      }
    }

    // Chercher ou créer le document
    let doc = await this.documentsRepo.findOne({
      where: { employeeId, documentType },
    });

    if (!doc) {
      // Créer automatiquement le document
      const config = REQUIRED_DOCUMENTS_CONFIG.find(c => c.type === documentType);
      const employee = await this.employeesRepo.findOne({ where: { id: employeeId } });
      if (!employee) {
        throw new NotFoundException('Employé non trouvé');
      }

      if (!employee.organizationId) {
        throw new BadRequestException('Employé sans organisation');
      }

      doc = new EmployeeRequiredDocument();
      doc.employeeId = employeeId;
      doc.organizationId = employee.organizationId;
      doc.documentType = documentType;
      doc.status = DocumentStatus.PENDING;
      doc.isOptional = config?.isOptional || false;
    }

    // Upload vers Supabase Storage ; on stocke la clé Storage (= chemin
    // relatif "employee-documents/<uuid>.ext", servi via /uploads/<clé>).
    const key = makeStorageKey('employee-documents', file.originalname);
    await this.storage.upload(key, file.buffer, file.mimetype);

    doc.filePath = key as any;
    doc.fileName = file.originalname;
    doc.fileMimeType = file.mimetype;
    doc.fileSize = file.size;
    doc.status = DocumentStatus.UPLOADED;
    doc.expiryDate = (expiryDate || null) as any;

    return this.documentsRepo.save(doc);
  }

  /**
   * Enregistrer une valeur texte (ex: numéro CNSS) - crée automatiquement le document s'il n'existe pas
   */
  async setTextValue(
    employeeId: string,
    documentType: RequiredDocumentType,
    value: string,
  ): Promise<EmployeeRequiredDocument> {
    let doc = await this.documentsRepo.findOne({
      where: { employeeId, documentType },
    });

    if (!doc) {
      // Créer automatiquement le document
      const config = REQUIRED_DOCUMENTS_CONFIG.find(c => c.type === documentType);
      const employee = await this.employeesRepo.findOne({ where: { id: employeeId } });
      if (!employee) {
        throw new NotFoundException('Employé non trouvé');
      }

      if (!employee.organizationId) {
        throw new BadRequestException('Employé sans organisation');
      }

      doc = new EmployeeRequiredDocument();
      doc.employeeId = employeeId;
      doc.organizationId = employee.organizationId;
      doc.documentType = documentType;
      doc.status = DocumentStatus.PENDING;
      doc.isOptional = config?.isOptional || false;
    }

    doc.textValue = value;
    doc.status = DocumentStatus.UPLOADED;

    return this.documentsRepo.save(doc);
  }

  /**
   * Valider un document (RH)
   */
  async validateDocument(
    documentId: string,
    validatedBy: string,
  ): Promise<EmployeeRequiredDocument> {
    const doc = await this.documentsRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      throw new NotFoundException('Document non trouvé');
    }

    doc.status = DocumentStatus.VALIDATED;
    doc.validatedBy = validatedBy;
    doc.validatedAt = new Date();

    return this.documentsRepo.save(doc);
  }

  /**
   * Rejeter un document (RH)
   */
  async rejectDocument(
    documentId: string,
    rejectedBy: string,
    reason: string,
  ): Promise<EmployeeRequiredDocument> {
    const doc = await this.documentsRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      throw new NotFoundException('Document non trouvé');
    }

    doc.status = DocumentStatus.REJECTED;
    doc.validatedBy = rejectedBy;
    doc.validatedAt = new Date();
    doc.rejectionReason = reason;
    doc.filePath = null;
    doc.fileName = null;

    return this.documentsRepo.save(doc);
  }

  /**
   * Récupérer les employés avec documents incomplets (pour rappels)
   */
  async getEmployeesWithIncompleteDocuments(organizationId?: string): Promise<{
    employeeId: string;
    employeeName: string;
    missingDocuments: RequiredDocumentType[];
    overdueDocuments: RequiredDocumentType[];
    daysUntilDeadline: number | null;
  }[]> {
    const query = this.documentsRepo.createQueryBuilder('doc')
      .leftJoinAndSelect('doc.employee', 'employee')
      .where('doc.status IN (:...statuses', { statuses: [DocumentStatus.PENDING, DocumentStatus.REJECTED] })
      .andWhere('doc.isOptional = false');

    if (organizationId) {
      query.andWhere('doc.organizationId = :orgId', { orgId: organizationId });
    }

    const documents = await query.getMany();

    // Grouper par employé
    const employeeMap = new Map<string, {
      employeeId: string;
      employeeName: string;
      missingDocuments: RequiredDocumentType[];
      overdueDocuments: RequiredDocumentType[];
      nearestDueDate: Date | null;
    }>();

    for (const doc of documents) {
      const empId = doc.employeeId;
      if (!employeeMap.has(empId)) {
        employeeMap.set(empId, {
          employeeId: empId,
          employeeName: doc.employee.user ? `${doc.employee.user.firstName} ${doc.employee.user.lastName}` : doc.employee.employeeNumber,
          missingDocuments: [],
          overdueDocuments: [],
          nearestDueDate: doc.dueDate || new Date(),
        });
      }

      const empData = employeeMap.get(empId)!;

      // Plus de vérification de retard - juste compter les documents manquants
      empData.missingDocuments.push(doc.documentType);
    }

    return Array.from(employeeMap.values()).map(emp => ({
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      missingDocuments: emp.missingDocuments,
      overdueDocuments: emp.overdueDocuments,
      daysUntilDeadline: null,
    }));
  }

  /**
   * Récupérer les documents nécessitant un rappel
   */
  async getDocumentsNeedingReminder(): Promise<EmployeeRequiredDocument[]> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return this.documentsRepo.find({
      where: {
        status: In([DocumentStatus.PENDING, DocumentStatus.REJECTED]),
        reminderSentAt: LessThan(oneDayAgo) || IsNull(),
      },
      relations: ['employee', 'employee.user'],
    });
  }

  /**
   * Marquer un rappel comme envoyé
   */
  async markReminderSent(documentId: string): Promise<void> {
    await this.documentsRepo.update(documentId, {
      reminderSentAt: new Date(),
    });
  }

  /**
   * Calculer le % de complétion du dossier
   */
  async getCompletionPercentage(employeeId: string): Promise<{
    percentage: number;
    total: number;
    completed: number;
    pending: number;
    overdue: number;
  }> {
    const documents = await this.documentsRepo.find({
      where: { employeeId, isOptional: false },
    });

    const total = documents.length;
    const completed = documents.filter(d => d.status === DocumentStatus.VALIDATED).length;
    const pending = documents.filter(d =>
      d.status === DocumentStatus.PENDING || d.status === DocumentStatus.UPLOADED
    ).length;
    const overdue = documents.filter(d =>
      (d.status === DocumentStatus.PENDING || d.status === DocumentStatus.REJECTED) &&
      d.dueDate && new Date() > d.dueDate
    ).length;

    return {
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      total,
      completed,
      pending,
      overdue,
    };
  }
}
