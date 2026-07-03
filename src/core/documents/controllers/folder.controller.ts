import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { FolderService } from '../services/folder.service';
import { CreateFolderDto, UpdateFolderDto } from '../dto/folder.dto';
import { DOCUMENTS_MODULE_CODE, DOCUMENTS_PERMISSIONS } from '../documents.permissions';
import { ConfidentialityLevel } from '../documents.permissions';

@UseGuards(PermissionGuard)
@Controller('core/documents/folders')
export class FolderController {
  constructor(private readonly service: FolderService) {}

  @Get()
  @RequirePermission(DOCUMENTS_PERMISSIONS.DOCS_FOLDERS_READ, { moduleCode: DOCUMENTS_MODULE_CODE })
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    const parentRaw = query.parentFolderId;
    return this.service.findChildren(tenant?.id as string, {
      libraryId: typeof query.libraryId === 'string' ? query.libraryId : undefined,
      parentFolderId:
        parentRaw === 'root' || parentRaw === '' ? null : (typeof parentRaw === 'string' ? parentRaw : undefined),
      search: typeof query.search === 'string' ? query.search.trim() : undefined,
    });
  }

  @Get(':id')
  @RequirePermission(DOCUMENTS_PERMISSIONS.DOCS_FOLDERS_READ, { moduleCode: DOCUMENTS_MODULE_CODE })
  async findOne(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findOne(tenant?.id as string, id);
  }

  @Get(':id/breadcrumb')
  @RequirePermission(DOCUMENTS_PERMISSIONS.DOCS_FOLDERS_READ, { moduleCode: DOCUMENTS_MODULE_CODE })
  async breadcrumb(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.breadcrumb(tenant?.id as string, id);
  }

  @Post()
  @RequirePermission(DOCUMENTS_PERMISSIONS.DOCS_FOLDERS_CREATE, { moduleCode: DOCUMENTS_MODULE_CODE })
  async create(@Req() req: any, @Body() dto: CreateFolderDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.create(tenant?.id as string, user?.id ?? null, {
      ...dto,
      confidentialityLevel: dto.confidentialityLevel as ConfidentialityLevel | undefined,
    });
  }

  @Patch(':id')
  @RequirePermission(DOCUMENTS_PERMISSIONS.DOCS_FOLDERS_UPDATE, { moduleCode: DOCUMENTS_MODULE_CODE })
  async update(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFolderDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, user?.id ?? null, {
      ...dto,
      confidentialityLevel: dto.confidentialityLevel as ConfidentialityLevel | undefined,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(DOCUMENTS_PERMISSIONS.DOCS_FOLDERS_DELETE, { moduleCode: DOCUMENTS_MODULE_CODE })
  async remove(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    await this.service.softDelete(tenant?.id as string, id, user?.id ?? null);
  }
}
