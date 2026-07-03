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
  Req,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { DocumentLibraryService } from '../services/document-library.service';
import { CreateLibraryDto, UpdateLibraryDto } from '../dto/document-library.dto';
import { DOCUMENTS_MODULE_CODE, DOCUMENTS_PERMISSIONS } from '../documents.permissions';

@UseGuards(PermissionGuard)
@Controller('core/documents/libraries')
export class DocumentLibraryController {
  constructor(private readonly service: DocumentLibraryService) {}

  @Get()
  @RequirePermission(DOCUMENTS_PERMISSIONS.DOCS_LIBRARIES_READ, { moduleCode: DOCUMENTS_MODULE_CODE })
  async list(@Req() req: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findAll(tenant?.id as string);
  }

  @Get(':id')
  @RequirePermission(DOCUMENTS_PERMISSIONS.DOCS_LIBRARIES_READ, { moduleCode: DOCUMENTS_MODULE_CODE })
  async findOne(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findOne(tenant?.id as string, id);
  }

  @Post()
  @RequirePermission(DOCUMENTS_PERMISSIONS.DOCS_LIBRARIES_CREATE, { moduleCode: DOCUMENTS_MODULE_CODE })
  async create(@Req() req: any, @Body() dto: CreateLibraryDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.create(tenant?.id as string, user?.id ?? null, dto);
  }

  @Patch(':id')
  @RequirePermission(DOCUMENTS_PERMISSIONS.DOCS_LIBRARIES_UPDATE, { moduleCode: DOCUMENTS_MODULE_CODE })
  async update(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLibraryDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, user?.id ?? null, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(DOCUMENTS_PERMISSIONS.DOCS_LIBRARIES_DELETE, { moduleCode: DOCUMENTS_MODULE_CODE })
  async remove(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    await this.service.softDelete(tenant?.id as string, id, user?.id ?? null);
  }
}
