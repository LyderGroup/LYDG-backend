import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequiredDocumentsService, REQUIRED_DOCUMENTS_CONFIG } from './required-documents.service';
import { EmployeeRequiredDocument, RequiredDocumentType, DocumentStatus } from './employee-required-document.entity';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from './hr.permissions';
import {
  buildUploadConfig,
  MIME_DOCUMENTS,
  MIME_IMAGES,
  MIME_OFFICE,
} from '../security/multer.config';

interface MulterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

// Configuration Multer sécurisée (taille, MIME, extensions, nom UUID)
const uploadConfig = buildUploadConfig({
  subdir: 'employee-documents',
  allowedMimes: [...MIME_DOCUMENTS, ...MIME_IMAGES, ...MIME_OFFICE],
  maxFileSize: 15 * 1024 * 1024,
});

@Controller('core/hr/required-documents')
@UseGuards(PermissionGuard)
export class RequiredDocumentsController {
  constructor(private readonly requiredDocsService: RequiredDocumentsService) { }

  /**
   * Récupérer la liste des types de documents obligatoires (public)
   */
  @Get('config')
  getConfig() {
    return REQUIRED_DOCUMENTS_CONFIG.map(c => ({
      type: c.type,
      displayName: c.displayName,
      description: c.description,
      isOptional: c.isOptional,
      hasExpiryDate: c.hasExpiryDate,
      maxFileSizeMB: c.maxFileSizeMB,
      allowedMimeTypes: c.allowedMimeTypes,
      dueDaysFromHire: c.dueDaysFromHire,
    }));
  }

  /**
   * Récupérer mes documents obligatoires (employé connecté) - PAR DÉFAUT
   */
  @Get('my')
  @RequirePermission(HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_READ_OWN, { moduleCode: 'module_c_rh' })
  async getMyDocuments(@Req() req: any) {
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }

    const documents = await this.requiredDocsService.getEmployeeDocuments(employeeId);
    const completion = await this.requiredDocsService.getCompletionPercentage(employeeId);

    return {
      documents,
      completion,
    };
  }

  /**
   * Vérifier et notifier les documents manquants à la connexion
   */
  @Post('my/check-reminders')
  @RequirePermission(HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_READ_OWN, { moduleCode: 'module_c_rh' })
  async checkReminders(@Req() req: any) {
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }

    const documents = await this.requiredDocsService.getEmployeeDocuments(employeeId);
    const pendingDocs = documents.filter(d =>
      d.status === 'pending' || d.status === 'rejected'
    );

    return {
      hasPendingDocuments: pendingDocs.length > 0,
      pendingCount: pendingDocs.length,
      pendingTypes: pendingDocs.map(d => d.documentType),
    };
  }

  /**
   * Récupérer les documents d'un employé (RH)
   */
  @Get('employee/:employeeId')
  @RequirePermission(HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_READ_ALL, { moduleCode: 'module_c_rh' })
  async getEmployeeDocuments(
    @Param('employeeId') employeeId: string,
  ): Promise<{ documents: EmployeeRequiredDocument[]; completion: any }> {
    const documents = await this.requiredDocsService.getEmployeeDocuments(employeeId);
    const completion = await this.requiredDocsService.getCompletionPercentage(employeeId);

    return { documents, completion };
  }

  @Post('my/upload/:documentType')
  @UseInterceptors(FileInterceptor('file', uploadConfig))
  @RequirePermission(HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_UPLOAD, { moduleCode: 'module_c_rh' })
  async uploadMyDocument(
    @Req() req: any,
    @Param('documentType') documentType: RequiredDocumentType,
    @UploadedFile() file: MulterFile,
    @Body('expiryDate') expiryDate?: string,
  ): Promise<EmployeeRequiredDocument> {
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }

    if (!file) {
      throw new BadRequestException('Fichier requis');
    }

    const expiry = expiryDate ? new Date(expiryDate) : undefined;
    return this.requiredDocsService.uploadDocument(employeeId, documentType, file, expiry);
  }

  @Post('my/text/:documentType')
  @RequirePermission(HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_UPLOAD, { moduleCode: 'module_c_rh' })
  async setMyTextValue(
    @Req() req: any,
    @Param('documentType') documentType: RequiredDocumentType,
    @Body('value') value: string,
  ): Promise<EmployeeRequiredDocument> {
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }

    return this.requiredDocsService.setTextValue(employeeId, documentType, value);
  }
  @Put(':documentId/validate')
  @RequirePermission(HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_VALIDATE, { moduleCode: 'module_c_rh' })
  async validateDocument(
    @Req() req: any,
    @Param('documentId') documentId: string,
  ): Promise<EmployeeRequiredDocument> {
    return this.requiredDocsService.validateDocument(documentId, req.user.id);
  }

  /**
   * Rejeter un document (RH)
   */
  @Put(':documentId/reject')
  @RequirePermission(HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_VALIDATE, { moduleCode: 'module_c_rh' })
  async rejectDocument(
    @Req() req: any,
    @Param('documentId') documentId: string,
    @Body('reason') reason: string,
  ): Promise<EmployeeRequiredDocument> {
    return this.requiredDocsService.rejectDocument(documentId, req.user.id, reason);
  }

  /**
   * Liste des employés avec dossiers incomplets (RH)
   */
  @Get('incomplete')
  @RequirePermission(HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_READ_ALL, { moduleCode: 'module_c_rh' })
  async getIncompleteDocuments(@Req() req: any) {
    const organizationId = req.tenant?.id || req.user.organizationId;
    return this.requiredDocsService.getEmployeesWithIncompleteDocuments(organizationId);
  }
}
