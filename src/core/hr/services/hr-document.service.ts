import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { HrDocument, HrDocumentType, HrDocumentStatus, HrDocumentAction } from '../entities/hr-document.entity';
import { HrDocumentAssignment, HrAssignmentStatus } from '../entities/hr-document-assignment.entity';
import { Employee } from '../employee.entity';
import { User } from '../../users/user.entity';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

interface CreateDocumentInput {
  documentType: HrDocumentType;
  title: string;
  referenceCode?: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  requiredAction?: HrDocumentAction;
  requiresSignature?: boolean;
  deadlineDays?: number;
  allowDownload?: boolean;
  allowPrint?: boolean;
  effectiveDate?: string;
  expiryDate?: string;
}

interface AssignDocumentInput {
  documentId: string;
  employeeIds: string[];
  dueDate?: string;
  sendNotification?: boolean;
}

interface SignDocumentInput {
  signatureData: string;
  signatureImageUrl?: string;
}

@Injectable()
export class HrDocumentService {
  constructor(
    @InjectRepository(HrDocument)
    private readonly documentRepo: Repository<HrDocument>,
    @InjectRepository(HrDocumentAssignment)
    private readonly assignmentRepo: Repository<HrDocumentAssignment>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) { }

  // Créer un nouveau document (Super Admin uniquement)
  async createDocument(
    organizationId: string,
    userId: string,
    input: CreateDocumentInput,
  ): Promise<HrDocument> {
    const document = this.documentRepo.create({
      organizationId,
      documentType: input.documentType,
      title: input.title,
      referenceCode: input.referenceCode || null,
      description: input.description || null,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      fileSize: input.fileSize || null,
      mimeType: input.mimeType || null,
      requiredAction: input.requiredAction || 'READ_ONLY',
      requiresSignature: input.requiresSignature || false,
      deadlineDays: input.deadlineDays || null,
      allowDownload: input.allowDownload || false,
      allowPrint: input.allowPrint || false,
      effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      status: 'draft',
      createdBy: userId,
    });

    return this.documentRepo.save(document);
  }

  // Publier un document et l'assigner aux employés
  async publishDocument(
    organizationId: string,
    userId: string,
    documentId: string,
    employeeIds?: string[], // Si non fourni, assigner à tous les employés
  ): Promise<HrDocument> {
    const document = await this.documentRepo.findOne({
      where: { id: documentId, organizationId, deletedAt: null as any },
    });

    if (!document) {
      throw new NotFoundException('Document non trouvé');
    }

    if (document.status !== 'draft') {
      throw new BadRequestException('Le document doit être en brouillon pour être publié');
    }

    // Récupérer les employés à assigner
    let employees: Employee[];
    if (employeeIds && employeeIds.length > 0) {
      employees = await this.employeeRepo.find({
        where: { id: In(employeeIds), organizationId },
      });
    } else {
      // Assigner à tous les employés actifs
      employees = await this.employeeRepo.find({
        where: { organizationId, employmentStatus: 'active' },
      });
    }

    // Calculer la date d'échéance
    let dueDate: Date | null = null;
    if (document.deadlineDays) {
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + document.deadlineDays);
    }

    // Créer les assignations
    const assignments = employees.map((emp) =>
      this.assignmentRepo.create({
        organizationId,
        documentId: document.id,
        employeeId: emp.id,
        assignedBy: userId,
        dueDate,
        status: 'pending',
      }),
    );

    await this.dataSource.transaction(async (manager) => {
      // Mettre à jour le statut du document
      document.status = 'active';
      document.publishedAt = new Date();
      document.publishedBy = userId;
      await manager.save(document);

      // Sauvegarder les assignations
      await manager.save(assignments);
    });

    return document;
  }

  // Lister les documents (pour l'admin)
  async listDocuments(
    organizationId: string,
    filters?: {
      documentType?: HrDocumentType;
      status?: HrDocumentStatus;
    },
  ): Promise<HrDocument[]> {
    const query = this.documentRepo.createQueryBuilder('doc')
      .where('doc.organizationId = :organizationId', { organizationId })
      .andWhere('doc.deletedAt IS NULL')
      .orderBy('doc.createdAt', 'DESC');

    if (filters?.documentType) {
      query.andWhere('doc.documentType = :documentType', { documentType: filters.documentType });
    }
    if (filters?.status) {
      query.andWhere('doc.status = :status', { status: filters.status });
    }

    return query.getMany();
  }

  // Lister les documents assignés à un employé
  async listMyDocuments(
    organizationId: string,
    employeeId: string,
  ): Promise<(HrDocumentAssignment & { document: HrDocument })[]> {
    console.log('[listMyDocuments] Recherche pour employeeId:', employeeId, 'organizationId:', organizationId);

    const assignments = await this.assignmentRepo
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.document', 'document')
      .where('assignment.employeeId = :employeeId', { employeeId })
      .andWhere('document.organizationId = :organizationId', { organizationId })
      .andWhere('document.deletedAt IS NULL')
      .andWhere('assignment.deletedAt IS NULL')
      .orderBy('assignment.createdAt', 'DESC')
      .getMany();

    console.log('[listMyDocuments] Assignations trouvées:', assignments.length);

    return assignments as (HrDocumentAssignment & { document: HrDocument })[];
  }

  // Marquer un document comme vu
  async markAsViewed(
    organizationId: string,
    assignmentId: string,
    employeeId: string,
  ): Promise<HrDocumentAssignment> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId, employeeId },
      relations: ['document'],
    });

    if (!assignment || assignment.document.organizationId !== organizationId) {
      throw new NotFoundException('Assignation non trouvée');
    }

    if (!assignment.firstViewedAt) {
      assignment.firstViewedAt = new Date();
    }
    assignment.viewCount += 1;
    assignment.lastViewedAt = new Date();

    if (assignment.status === 'pending') {
      assignment.status = 'viewed';
    }

    return this.assignmentRepo.save(assignment);
  }

  // Mettre à jour le temps passé sur un document
  async updateTimeSpent(
    organizationId: string,
    assignmentId: string,
    employeeId: string,
    timeSpentSeconds: number,
  ): Promise<HrDocumentAssignment> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId, employeeId },
      relations: ['document'],
    });

    if (!assignment || assignment.document.organizationId !== organizationId) {
      throw new NotFoundException('Assignation non trouvée');
    }

    assignment.totalTimeSpent = (assignment.totalTimeSpent || 0) + timeSpentSeconds;

    return this.assignmentRepo.save(assignment);
  }

  // Accuser réception d'un document (ACKNOWLEDGE)
  async acknowledgeDocument(
    organizationId: string,
    assignmentId: string,
    employeeId: string,
  ): Promise<HrDocumentAssignment> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId, employeeId },
      relations: ['document'],
    });

    if (!assignment || assignment.document.organizationId !== organizationId) {
      throw new NotFoundException('Assignation non trouvée');
    }

    if (assignment.document.requiredAction !== 'ACKNOWLEDGE') {
      throw new BadRequestException('Ce document ne nécessite pas un accusé de réception');
    }

    assignment.status = 'acknowledged';
    assignment.firstViewedAt = assignment.firstViewedAt || new Date();

    return this.assignmentRepo.save(assignment);
  }

  // Signer un document
  async signDocument(
    organizationId: string,
    assignmentId: string,
    employeeId: string,
    input: SignDocumentInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<HrDocumentAssignment> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId, employeeId },
      relations: ['document', 'employee'],
    });

    if (!assignment || assignment.document.organizationId !== organizationId) {
      throw new NotFoundException('Assignation non trouvée');
    }

    if (!assignment.document.requiresSignature) {
      throw new BadRequestException('Ce document ne nécessite pas de signature');
    }

    if (assignment.status === 'signed') {
      throw new BadRequestException('Ce document a déjà été signé');
    }

    // Générer un hash de la signature
    const signatureHash = crypto
      .createHash('sha256')
      .update(input.signatureData + assignment.id + Date.now())
      .digest('hex');

    assignment.status = 'signed';
    assignment.signedAt = new Date();
    assignment.signatureData = input.signatureData;
    assignment.signatureImageUrl = input.signatureImageUrl || null;
    assignment.signatureId = signatureHash;

    return this.assignmentRepo.save(assignment);
  }

  // Rejeter un document
  async rejectDocument(
    organizationId: string,
    assignmentId: string,
    employeeId: string,
    reason: string,
  ): Promise<HrDocumentAssignment> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId, employeeId },
      relations: ['document'],
    });

    if (!assignment || assignment.document.organizationId !== organizationId) {
      throw new NotFoundException('Assignation non trouvée');
    }

    assignment.status = 'rejected';
    assignment.rejectionReason = reason;
    assignment.rejectedAt = new Date();

    return this.assignmentRepo.save(assignment);
  }

  // Obtenir les statistiques d'un document
  async getDocumentStats(
    organizationId: string,
    documentId: string,
  ): Promise<{
    total: number;
    pending: number;
    viewed: number;
    signed: number;
    acknowledged: number;
    rejected: number;
  }> {
    const document = await this.documentRepo.findOne({
      where: { id: documentId, organizationId },
    });

    if (!document) {
      throw new NotFoundException('Document non trouvé');
    }

    const assignments = await this.assignmentRepo.find({
      where: { documentId },
    });

    return {
      total: assignments.length,
      pending: assignments.filter((a) => a.status === 'pending').length,
      viewed: assignments.filter((a) => a.status === 'viewed').length,
      signed: assignments.filter((a) => a.status === 'signed').length,
      acknowledged: assignments.filter((a) => a.status === 'acknowledged').length,
      rejected: assignments.filter((a) => a.status === 'rejected').length,
    };
  }

  // Obtenir l'audit détaillé d'un document (qui a ouvert, lu, temps passé)
  async getDocumentAudit(
    organizationId: string,
    documentId: string,
  ): Promise<{
    document: HrDocument;
    stats: {
      total: number;
      pending: number;
      viewed: number;
      signed: number;
      acknowledged: number;
      rejected: number;
      avgTimeSpent: number;
      totalViews: number;
    };
    assignments: Array<{
      id: string;
      employeeId: string;
      employeeName: string;
      employeeEmail: string | null;
      department: string | null;
      status: HrAssignmentStatus;
      firstViewedAt: Date | null;
      lastViewedAt: Date | null;
      viewCount: number;
      totalTimeSpent: number;
      signedAt: Date | null;
      acknowledgedAt: Date | null;
      assignedAt: Date;
      dueDate: Date | null;
    }>;
  }> {
    const document = await this.documentRepo.findOne({
      where: { id: documentId, organizationId },
    });

    if (!document) {
      throw new NotFoundException('Document non trouvé');
    }

    const assignments = await this.assignmentRepo
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('employee.department', 'department')
      .where('assignment.documentId = :documentId', { documentId })
      .andWhere('assignment.deletedAt IS NULL')
      .orderBy('assignment.firstViewedAt', 'ASC', 'NULLS LAST')
      .getMany();

    const assignmentDetails = assignments.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      employeeName: a.employee?.user
        ? `${a.employee.user.firstName} ${a.employee.user.lastName}`
        : `Employé ${a.employeeId}`,
      employeeEmail: a.employee?.user?.email || null,
      department: a.employee?.department?.name || null,
      status: a.status,
      firstViewedAt: a.firstViewedAt,
      lastViewedAt: a.lastViewedAt,
      viewCount: a.viewCount,
      totalTimeSpent: a.totalTimeSpent || 0,
      signedAt: a.signedAt,
      acknowledgedAt: a.status === 'acknowledged' ? a.updatedAt : null,
      assignedAt: a.assignedAt,
      dueDate: a.dueDate,
    }));

    const totalViews = assignments.reduce((sum, a) => sum + (a.viewCount || 0), 0);
    const totalTime = assignments.reduce((sum, a) => sum + (a.totalTimeSpent || 0), 0);
    const viewedCount = assignments.filter((a) => a.firstViewedAt).length;

    return {
      document,
      stats: {
        total: assignments.length,
        pending: assignments.filter((a) => a.status === 'pending').length,
        viewed: assignments.filter((a) => a.status === 'viewed').length,
        signed: assignments.filter((a) => a.status === 'signed').length,
        acknowledged: assignments.filter((a) => a.status === 'acknowledged').length,
        rejected: assignments.filter((a) => a.status === 'rejected').length,
        avgTimeSpent: viewedCount > 0 ? Math.round(totalTime / viewedCount) : 0,
        totalViews,
      },
      assignments: assignmentDetails,
    };
  }

  // Archiver un document
  async archiveDocument(
    organizationId: string,
    documentId: string,
  ): Promise<HrDocument> {
    const document = await this.documentRepo.findOne({
      where: { id: documentId, organizationId },
    });

    if (!document) {
      throw new NotFoundException('Document non trouvé');
    }

    document.status = 'archived';
    return this.documentRepo.save(document);
  }

  // Supprimer un document (soft delete)
  async deleteDocument(
    organizationId: string,
    documentId: string,
  ): Promise<void> {
    const document = await this.documentRepo.findOne({
      where: { id: documentId, organizationId },
    });

    if (!document) {
      throw new NotFoundException('Document non trouvé');
    }

    document.deletedAt = new Date();
    await this.documentRepo.save(document);
  }

  // Obtenir un document par ID
  async getDocument(
    organizationId: string,
    documentId: string,
  ): Promise<HrDocument> {
    const document = await this.documentRepo.findOne({
      where: { id: documentId, organizationId, deletedAt: null as any },
      relations: ['assignments', 'assignments.employee'],
    });

    if (!document) {
      throw new NotFoundException('Document non trouvé');
    }

    return document;
  }
}
