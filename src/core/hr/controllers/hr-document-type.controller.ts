import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';
import { HrDocumentTypeConfig, HrDocumentDefaultAction } from '../entities/hr-document-type.entity';

@Controller('core/hr/document-types')
@UseGuards(PermissionGuard)
export class HrDocumentTypeController {
  constructor(
    @InjectRepository(HrDocumentTypeConfig)
    private readonly docTypeRepo: Repository<HrDocumentTypeConfig>,
  ) { }

  // Lister tous les types de documents
  @Get()
  @RequirePermission(HR_PERMISSIONS.HR_DOCUMENTS_READ, { moduleCode: 'module_c_rh' })
  async listDocumentTypes(@Request() req: any) {
    const { organizationId } = req.user;

    return this.docTypeRepo.find({
      where: { organizationId, isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  // Créer un nouveau type de document
  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_MANAGE, { moduleCode: 'module_c_rh' })
  async createDocumentType(
    @Request() req: any,
    @Body() body: { code: string; name: string; description?: string; defaultAction?: HrDocumentDefaultAction },
  ) {
    const { organizationId, id: userId } = req.user;

    if (!body.code || !body.name) {
      throw new BadRequestException('Code et nom requis');
    }

    // Vérifier si le code existe déjà
    const existing = await this.docTypeRepo.findOne({
      where: { organizationId, code: body.code.toUpperCase() },
    });

    if (existing) {
      throw new BadRequestException('Ce code existe déjà');
    }

    const docType = this.docTypeRepo.create({
      organizationId,
      code: body.code.toUpperCase(),
      name: body.name,
      description: body.description || null,
      defaultAction: body.defaultAction || 'READ_ONLY',
      createdBy: userId,
    });

    return this.docTypeRepo.save(docType);
  }

  // Mettre à jour un type de document
  @Put(':id')
  @RequirePermission(HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_MANAGE, { moduleCode: 'module_c_rh' })
  async updateDocumentType(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; defaultAction?: string; isActive?: boolean },
  ) {
    const { organizationId } = req.user;

    const docType = await this.docTypeRepo.findOne({
      where: { id, organizationId },
    });

    if (!docType) {
      throw new BadRequestException('Type de document non trouvé');
    }

    if (docType.isSystem) {
      throw new BadRequestException('Les types système ne peuvent pas être modifiés');
    }

    Object.assign(docType, body);
    return this.docTypeRepo.save(docType);
  }

  // Supprimer un type de document
  @Delete(':id')
  @RequirePermission(HR_PERMISSIONS.HR_REQUIRED_DOCUMENTS_MANAGE, { moduleCode: 'module_c_rh' })
  async deleteDocumentType(@Request() req: any, @Param('id') id: string) {
    const { organizationId } = req.user;

    const docType = await this.docTypeRepo.findOne({
      where: { id, organizationId },
    });

    if (!docType) {
      throw new BadRequestException('Type de document non trouvé');
    }

    if (docType.isSystem) {
      throw new BadRequestException('Les types système ne peuvent pas être supprimés');
    }

    await this.docTypeRepo.softRemove(docType);
    return { success: true };
  }
}
