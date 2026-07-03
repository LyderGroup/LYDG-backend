import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Put,
  Delete,
  Body,
  NotFoundException,
  Param,
  Query,
  Res,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { extname } from 'path';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FileInterceptor } from '@nestjs/platform-express';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';
import { HrDocumentService } from '../services/hr-document.service';
import type { HrDocumentType, HrDocumentStatus, HrDocumentAction } from '../entities/hr-document.entity';
import { IsOptional, IsArray, IsString, IsBoolean, IsDateString, ValidateNested, Allow } from 'class-validator';
import { buildUploadConfig, makeStorageKey, MIME_DOCUMENTS } from '../../security/multer.config';
import { SupabaseStorageService } from '../../storage/supabase-storage.service';

// Configuration du stockage des fichiers : PDF uniquement, max 25 MB
const hrDocumentUploadConfig = buildUploadConfig({
  subdir: 'hr-documents',
  allowedMimes: MIME_DOCUMENTS,
  maxFileSize: 25 * 1024 * 1024,
});

// DTOs
class CreateDocumentDto {
  documentType!: HrDocumentType;
  title!: string;
  referenceCode?: string;
  description?: string;
  requiredAction?: HrDocumentAction;
  requiresSignature?: boolean;
  deadlineDays?: number;
  allowDownload?: boolean;
  allowPrint?: boolean;
  effectiveDate?: string;
  expiryDate?: string;
}

class PublishDocumentDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeIds?: string[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  sendNotification?: boolean;
}

class SignDocumentDto {
  signatureData!: string;
  signatureImageUrl?: string;
}

class RejectDocumentDto {
  reason!: string;
}

@Controller('core/hr/documents')
@UseGuards(PermissionGuard)
export class HrDocumentController {
  constructor(
    private readonly documentService: HrDocumentService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: SupabaseStorageService,
  ) { }

  // Créer un nouveau document avec fichier (Super Admin)
  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_UPLOAD, { moduleCode: 'module_c_rh' })
  @UseInterceptors(FileInterceptor('file', hrDocumentUploadConfig))
  async createDocument(
    @Request() req: any,
    @Body() body: any, // Utiliser any pour multipart/form-data
    @UploadedFile() file?: any,
  ) {
    const { organizationId, id: userId } = req.user;

    if (!file) {
      throw new BadRequestException('Fichier requis');
    }

    // Upload vers Supabase Storage (bucket privé). La clé Storage est aussi le
    // chemin "/uploads/..." conservé en DB → l'endpoint de download la relit.
    const key = makeStorageKey('hr-documents', file.originalname);
    await this.storage.upload(key, file.buffer, file.mimetype);
    const fileUrl = `/uploads/${key}`;
    const mimeType = file.mimetype;
    const fileSize = file.size;

    // Utiliser le nom du fichier comme titre si non fourni
    const title = body.title || file.originalname.replace('.pdf', '').replace(/[-_]/g, ' ');

    const document = await this.documentService.createDocument(
      organizationId,
      userId,
      {
        documentType: (body.documentType as HrDocumentType) || 'OTHER',
        title,
        referenceCode: body.referenceCode || undefined,
        description: body.description || undefined,
        fileUrl,
        fileName: file.originalname,
        fileSize,
        mimeType,
        requiredAction: (body.requiredAction as HrDocumentAction) || 'READ_ONLY',
        requiresSignature: body.requiresSignature === 'true' || body.requiresSignature === true,
        deadlineDays: body.deadlineDays ? parseInt(String(body.deadlineDays), 10) : undefined,
        allowDownload: body.allowDownload === 'true' || body.allowDownload === true,
        allowPrint: body.allowPrint === 'true' || body.allowPrint === true,
        effectiveDate: body.effectiveDate || undefined,
        expiryDate: body.expiryDate || undefined,
      },
    );

    return document;
  }

  // Publier un document et l'assigner
  @Post(':id/publish')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_WRITE, { moduleCode: 'module_c_rh' })
  async publishDocument(
    @Request() req: any,
    @Param('id') documentId: string,
    @Body() body: PublishDocumentDto,
  ) {
    const { organizationId, id: userId } = req.user;

    const document = await this.documentService.publishDocument(
      organizationId,
      userId,
      documentId,
      body.employeeIds,
    );

    return document;
  }

  // Lister tous les documents (Admin)
  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ_ALL, { moduleCode: 'module_c_rh' })
  async listDocuments(
    @Request() req: any,
    @Query('documentType') documentType?: HrDocumentType,
    @Query('status') status?: HrDocumentStatus,
  ) {
    const { organizationId } = req.user;

    return this.documentService.listDocuments(organizationId, {
      documentType,
      status,
    });
  }

  @Get('my/documents')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ_OWN, { moduleCode: 'module_c_rh' })
  async listMyDocuments(
    @Request() req: any,
  ) {
    const { organizationId, employeeId } = req.user;

    console.log('[listMyDocuments] req.user:', JSON.stringify({ organizationId, employeeId }));

    if (!employeeId) {
      console.log('[listMyDocuments] ERREUR: employeeId est null');
      throw new BadRequestException('Employé non trouvé - aucun ID employé associé à cet utilisateur');
    }

    const result = await this.documentService.listMyDocuments(organizationId, employeeId);
    console.log('[listMyDocuments] Résultat:', JSON.stringify(result.length) + ' documents');
    return result;
  }

  @Get(':id')
  @RequirePermission([HR_PERMISSIONS.HR_DOCUMENTS_READ_ALL, HR_PERMISSIONS.HR_DOCUMENTS_READ_OWN], { moduleCode: 'module_c_rh' })
  async getDocument(
    @Request() req: any,
    @Param('id') documentId: string,
  ) {
    const { organizationId } = req.user;
    return this.documentService.getDocument(organizationId, documentId);
  }

  @Get(':id/stats')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ_ALL, { moduleCode: 'module_c_rh' })
  async getDocumentStats(
    @Request() req: any,
    @Param('id') documentId: string,
  ) {
    const { organizationId } = req.user;
    return this.documentService.getDocumentStats(organizationId, documentId);
  }

  // Obtenir l'audit détaillé d'un document (admin seulement)
  @Get(':id/audit')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ_ALL, { moduleCode: 'module_c_rh' })
  async getDocumentAudit(
    @Request() req: any,
    @Param('id') documentId: string,
  ) {
    const { organizationId } = req.user;
    return this.documentService.getDocumentAudit(organizationId, documentId);
  }

  /**
   * Téléchargement sécurisé d'un document RH.
   *
   * Règles d'accès (un seul check suffit) :
   *   1. L'utilisateur a HR_DOCUMENTS_READ_ALL → accès admin.
   *   2. L'utilisateur a une assignation active sur le document via son employeeId.
   *
   * Si `allowDownload === false`, on force `Content-Disposition: inline` afin
   * que le navigateur affiche le PDF mais bloque le bouton de download natif
   * (le téléchargement reste possible techniquement, c'est une mesure UX).
   *
   * Protection path-traversal : on borne le path résolu sous UPLOADS_ROOT.
   */
  @Get(':id/download')
  @RequirePermission([HR_PERMISSIONS.HR_DOCUMENTS_READ_ALL, HR_PERMISSIONS.HR_DOCUMENTS_READ_OWN], { moduleCode: 'module_c_rh' })
  async downloadDocument(
    @Request() req: any,
    @Param('id') documentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { organizationId, employeeId } = req.user;
    const permissionCodes: string[] = req.permissionCodes ?? [];
    const isAdmin = permissionCodes.includes(HR_PERMISSIONS.HR_DOCUMENTS_READ_ALL);

    // Charger le document pour récupérer fileUrl/fileName/mimeType/allowDownload
    const document = await this.documentService.getDocument(organizationId, documentId);
    if (!document) {
      throw new NotFoundException('Document introuvable');
    }

    // Si non-admin, vérifier que l'employé a une assignation active.
    if (!isAdmin) {
      if (!employeeId) {
        throw new ForbiddenException('Aucune fiche employé associée à votre compte');
      }
      const assignment = await this.dataSource.query(
        `SELECT 1 FROM module_c_rh.hr_document_assignments
          WHERE document_id = $1
            AND employee_id = $2
            AND organization_id = $3
            AND status NOT IN ('expired')
          LIMIT 1`,
        [documentId, employeeId, organizationId],
      );
      if (!assignment || assignment.length === 0) {
        throw new ForbiddenException('Vous n\'êtes pas destinataire de ce document');
      }
    }

    // fileUrl est de la forme "/uploads/hr-documents/<uuid>.pdf". La clé Storage
    // est le suffixe après "/uploads/". On récupère le fichier depuis le bucket
    // privé et on le streame (permission déjà vérifiée ci-dessus).
    const fileUrl: string = (document as any).fileUrl ?? '';
    if (!fileUrl) {
      throw new NotFoundException('Fichier non disponible');
    }
    const key = SupabaseStorageService.keyFromUploadsUrl(fileUrl);
    const stored = await this.storage.download(key);
    if (!stored) {
      throw new NotFoundException('Fichier introuvable sur le serveur');
    }

    const allowDownload: boolean = !!(document as any).allowDownload;
    const fileName: string =
      (document as any).fileName ?? `document${extname(key)}`;
    const mime: string =
      (document as any).mimeType ?? stored.contentType ?? 'application/octet-stream';

    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    // inline si téléchargement non autorisé : le navigateur affiche sans
    // proposer le bouton de téléchargement par défaut.
    const disposition = allowDownload ? 'attachment' : 'inline';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${fileName.replace(/"/g, '')}"`,
    );
    res.send(stored.buffer);
  }

  @Post('assignments/:assignmentId/view')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ_OWN, { moduleCode: 'module_c_rh' })
  async markAsViewed(
    @Request() req: any,
    @Param('assignmentId') assignmentId: string,
  ) {
    const { organizationId, employeeId } = req.user;

    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }

    return this.documentService.markAsViewed(organizationId, assignmentId, employeeId);
  }

  // Mettre à jour le temps passé sur un document
  @Post('assignments/:assignmentId/time-spent')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ_OWN, { moduleCode: 'module_c_rh' })
  async updateTimeSpent(
    @Request() req: any,
    @Param('assignmentId') assignmentId: string,
    @Body() body: { timeSpentSeconds: number },
  ) {
    const { organizationId, employeeId } = req.user;

    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }

    if (!body.timeSpentSeconds || body.timeSpentSeconds < 0) {
      throw new BadRequestException('timeSpentSeconds doit être un nombre positif');
    }

    return this.documentService.updateTimeSpent(
      organizationId,
      assignmentId,
      employeeId,
      body.timeSpentSeconds,
    );
  }

  @Post('assignments/:assignmentId/acknowledge')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_SIGN, { moduleCode: 'module_c_rh' })
  async acknowledgeDocument(
    @Request() req: any,
    @Param('assignmentId') assignmentId: string,
  ) {
    const { organizationId, employeeId } = req.user;

    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }

    return this.documentService.acknowledgeDocument(organizationId, assignmentId, employeeId);
  }

  // Signer un document
  @Post('assignments/:assignmentId/sign')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_SIGN, { moduleCode: 'module_c_rh' })
  async signDocument(
    @Request() req: any,
    @Param('assignmentId') assignmentId: string,
    @Body() body: SignDocumentDto,
  ) {
    const { organizationId, employeeId } = req.user;

    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }

    return this.documentService.signDocument(
      organizationId,
      assignmentId,
      employeeId,
      {
        signatureData: body.signatureData,
        signatureImageUrl: body.signatureImageUrl,
      },
      req.ip,
      req.headers['user-agent'],
    );
  }

  // Rejeter un document
  @Post('assignments/:assignmentId/reject')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_SIGN, { moduleCode: 'module_c_rh' })
  async rejectDocument(
    @Request() req: any,
    @Param('assignmentId') assignmentId: string,
    @Body() body: RejectDocumentDto,
  ) {
    const { organizationId, employeeId } = req.user;

    if (!employeeId) {
      throw new BadRequestException('Employé non trouvé');
    }

    return this.documentService.rejectDocument(organizationId, assignmentId, employeeId, body.reason);
  }

  // Archiver un document
  @Put(':id/archive')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_WRITE, { moduleCode: 'module_c_rh' })
  async archiveDocument(
    @Request() req: any,
    @Param('id') documentId: string,
  ) {
    const { organizationId } = req.user;
    return this.documentService.archiveDocument(organizationId, documentId);
  }

  // Supprimer un document
  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_DELETE, { moduleCode: 'module_c_rh' })
  async deleteDocument(
    @Request() req: any,
    @Param('id') documentId: string,
  ) {
    const { organizationId } = req.user;
    await this.documentService.deleteDocument(organizationId, documentId);
    return { success: true };
  }
}
