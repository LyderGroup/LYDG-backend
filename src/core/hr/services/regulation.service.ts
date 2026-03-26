import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InternalRegulation, RegulationStatus } from '../entities/internal-regulation.entity';
import { RegulationDocument } from '../entities/regulation-document.entity';
import { EmployeeRegulationAssignment, AssignmentStatus } from '../entities/employee-regulation-assignment.entity';
import { ElectronicSignature, SignatureStatus } from '../entities/electronic-signature.entity';
import { Employee } from '../employee.entity';

export interface CreateRegulationInput {
  title: string;
  version: string;
  description?: string;
  contentHtml: string;
  contentSummary?: string;
  effectiveDate: Date;
  expiryDate?: Date;
  requiresSignature?: boolean;
  signatureDeadlineDays?: number;
  allowDownload?: boolean;
  allowPrint?: boolean;
  allowCopy?: boolean;
}

export interface SignRegulationInput {
  assignmentId: string;
  signatureData: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  geolocation?: Record<string, any>;
}

@Injectable()
export class RegulationService {
  constructor(
    @InjectRepository(InternalRegulation)
    private readonly regulationRepo: Repository<InternalRegulation>,
    @InjectRepository(RegulationDocument)
    private readonly documentRepo: Repository<RegulationDocument>,
    @InjectRepository(EmployeeRegulationAssignment)
    private readonly assignmentRepo: Repository<EmployeeRegulationAssignment>,
    @InjectRepository(ElectronicSignature)
    private readonly signatureRepo: Repository<ElectronicSignature>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly dataSource: DataSource,
  ) { }

  async createRegulation(
    organizationId: string,
    createdBy: string,
    input: CreateRegulationInput,
  ): Promise<InternalRegulation> {
    const existing = await this.regulationRepo.findOne({
      where: {
        organizationId,
        title: input.title,
        version: input.version,
      },
    });

    if (existing) {
      throw new BadRequestException('Un règlement avec ce titre et cette version existe déjà');
    }

    const regulation = this.regulationRepo.create({
      organizationId,
      createdBy,
      title: input.title,
      version: input.version,
      description: input.description ?? null,
      contentHtml: input.contentHtml,
      contentSummary: input.contentSummary ?? null,
      effectiveDate: input.effectiveDate,
      expiryDate: input.expiryDate ?? null,
      requiresSignature: input.requiresSignature ?? true,
      signatureDeadlineDays: input.signatureDeadlineDays ?? 7,
      allowDownload: input.allowDownload ?? false,
      allowPrint: input.allowPrint ?? false,
      allowCopy: input.allowCopy ?? false,
      status: 'draft',
    });

    return this.regulationRepo.save(regulation);
  }

  async publishRegulation(
    organizationId: string,
    regulationId: string,
    approvedBy: string,
  ): Promise<InternalRegulation> {
    const regulation = await this.regulationRepo.findOne({
      where: { id: regulationId, organizationId },
    });

    if (!regulation) {
      throw new NotFoundException('Règlement non trouvé');
    }

    if (regulation.status !== 'draft') {
      throw new BadRequestException('Seul un règlement en brouillon peut être publié');
    }
    await this.regulationRepo.update(
      { organizationId, status: 'active' },
      { status: 'archived' },
    );
    regulation.status = 'active';
    regulation.approvedBy = approvedBy;
    regulation.approvedAt = new Date();

    const saved = await this.regulationRepo.save(regulation);

    await this.assignToAllEmployees(organizationId, regulationId);

    return saved;
  }

  async getActiveRegulation(organizationId: string): Promise<InternalRegulation | null> {
    return this.regulationRepo.findOne({
      where: { organizationId, status: 'active' },
      relations: ['documents'],
    });
  }

  async listRegulations(
    organizationId: string,
    includeArchived = false,
  ): Promise<InternalRegulation[]> {
    const query = this.regulationRepo
      .createQueryBuilder('r')
      .where('r.organizationId = :orgId', { orgId: organizationId })
      .andWhere('r.deletedAt IS NULL');

    if (!includeArchived) {
      query.andWhere('r.status != :archived', { archived: 'archived' });
    }

    return query.orderBy('r.createdAt', 'DESC').getMany();
  }


  async assignToAllEmployees(
    organizationId: string,
    regulationId: string,
  ): Promise<number> {
    const regulation = await this.regulationRepo.findOne({
      where: { id: regulationId },
    });

    if (!regulation) return 0;

    const employees = await this.employeeRepo.find({
      where: { organizationId, employmentStatus: 'active' },
      select: ['id'],
    });

    let assignedCount = 0;

    for (const employee of employees) {
      // Vérifier si déjà assigné
      const existing = await this.assignmentRepo.findOne({
        where: { employeeId: employee.id, regulationId },
      });

      if (!existing) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + regulation.signatureDeadlineDays);

        await this.assignmentRepo.save({
          employeeId: employee.id,
          regulationId,
          dueDate,
          status: 'pending' as AssignmentStatus,
        });

        assignedCount++;
      }
    }

    return assignedCount;
  }

  async getPendingAssignments(employeeId: string): Promise<EmployeeRegulationAssignment[]> {
    return this.assignmentRepo.find({
      where: { employeeId, status: 'pending' },
      relations: ['regulation'],
      order: { dueDate: 'ASC' },
    });
  }

  async markAsViewed(assignmentId: string): Promise<void> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId },
    });

    if (!assignment) return;

    assignment.viewCount += 1;
    assignment.lastViewedAt = new Date();

    if (!assignment.firstViewedAt) {
      assignment.firstViewedAt = new Date();
      assignment.status = 'viewed';
    }

    await this.assignmentRepo.save(assignment);
  }


  async signRegulation(
    organizationId: string,
    userId: string,
    input: SignRegulationInput,
  ): Promise<ElectronicSignature> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: input.assignmentId },
      relations: ['regulation', 'employee', 'employee.user'],
    });

    if (!assignment) {
      throw new NotFoundException('Assignation non trouvée');
    }

    if (assignment.status === 'signed') {
      throw new BadRequestException('Ce règlement a déjà été signé');
    }

    if (assignment.status === 'expired' || new Date() > assignment.dueDate) {
      assignment.status = 'expired';
      await this.assignmentRepo.save(assignment);
      throw new BadRequestException('Le délai de signature est dépassé');
    }

    const documentHash = this.generateHash(assignment.regulation.contentHtml);
    const signatureHash = this.generateHash(input.signatureData + documentHash);
    const verificationCode = await this.generateVerificationCode();

    const signerName = assignment.employee?.user
      ? `${assignment.employee.user.firstName} ${assignment.employee.user.lastName}`
      : assignment.employeeId;
    const signerEmail = assignment.employee?.user?.email ?? '';

    const signature = this.signatureRepo.create({
      organizationId,
      documentType: 'REGULATION',
      documentId: assignment.regulationId,
      documentVersion: assignment.regulation.version,
      documentHash,
      employeeId: assignment.employeeId,
      userId,
      signerName,
      signerEmail,
      signatureData: input.signatureData,
      signatureHash,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      deviceFingerprint: input.deviceFingerprint ?? null,
      geolocation: input.geolocation ?? {},
      signedAt: new Date(),
      verificationCode,
      status: 'valid' as SignatureStatus,
    });

    const savedSignature = await this.signatureRepo.save(signature);

    assignment.status = 'signed';
    await this.assignmentRepo.save(assignment);

    return savedSignature;
  }

  async refuseRegulation(
    assignmentId: string,
    reason: string,
  ): Promise<EmployeeRegulationAssignment> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw new NotFoundException('Assignation non trouvée');
    }

    assignment.status = 'refused';
    assignment.refusalReason = reason;
    assignment.refusedAt = new Date();

    return this.assignmentRepo.save(assignment);
  }

  async verifySignature(verificationCode: string): Promise<ElectronicSignature | null> {
    return this.signatureRepo.findOne({
      where: { verificationCode, status: 'valid' },
      relations: ['organization'],
    });
  }


  private generateHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async generateVerificationCode(): Promise<string> {
    const crypto = require('crypto');
    let code: string;
    let exists: ElectronicSignature | null;

    do {
      code = 'SIG' + crypto.randomBytes(4).toString('hex').toUpperCase();
      exists = await this.signatureRepo.findOne({
        where: { verificationCode: code },
      });
    } while (exists);

    return code;
  }


  async getSignatureStats(organizationId: string, regulationId?: string): Promise<{
    total: number;
    signed: number;
    pending: number;
    refused: number;
    expired: number;
  }> {
    const query = this.assignmentRepo
      .createQueryBuilder('a')
      .where('a.deletedAt IS NULL');

    if (regulationId) {
      query.andWhere('a.regulationId = :regId', { regId: regulationId });
    } else {
      query.innerJoin(
        'module_c_rh.internal_regulations',
        'r',
        'r.id = a.regulationId AND r.organizationId = :orgId',
        { orgId: organizationId },
      );
    }

    const assignments = await query.getMany();

    return {
      total: assignments.length,
      signed: assignments.filter(a => a.status === 'signed').length,
      pending: assignments.filter(a => a.status === 'pending' || a.status === 'viewed').length,
      refused: assignments.filter(a => a.status === 'refused').length,
      expired: assignments.filter(a => a.status === 'expired').length,
    };
  }
}
