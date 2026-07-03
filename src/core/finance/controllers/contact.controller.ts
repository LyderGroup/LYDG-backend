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
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { ContactService } from '../services/contact.service';
import { FinancePdfService } from '../services/finance-pdf.service';
import { CreateContactDto, UpdateContactDto } from '../dto/contact.dto';
import { FINANCE_MODULE_CODE, FINANCE_PERMISSIONS } from '../finance.permissions';

@UseGuards(PermissionGuard)
@Controller('core/finance/contacts')
export class ContactController {
  constructor(
    private readonly service: ContactService,
    private readonly pdf: FinancePdfService,
  ) {}

  @Get()
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_CONTACTS_READ, { moduleCode: FINANCE_MODULE_CODE })
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findPage(tenant?.id as string, {
      page: query.page ? parseInt(query.page as string, 10) : undefined,
      limit: query.limit ? parseInt(query.limit as string, 10) : undefined,
      search: typeof query.search === 'string' ? query.search.trim() : undefined,
      role: ['customer', 'supplier', 'partner'].includes(query.role) ? query.role : undefined,
      status: ['active', 'prospect', 'inactive', 'blocked'].includes(query.status) ? query.status : undefined,
      includeInactive: query.includeInactive === 'true',
    });
  }

  @Get(':id')
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_CONTACTS_READ, { moduleCode: FINANCE_MODULE_CODE })
  async findOne(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findOne(tenant?.id as string, id);
  }

  @Get(':id/pdf')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_CONTACTS_READ, { moduleCode: FINANCE_MODULE_CODE })
  async downloadPdf(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const contact = await this.service.findOne(tenant?.id as string, id);
    const buffer = await this.pdf.renderContact(contact);
    const personName = [contact.firstName, contact.lastName].filter(Boolean).join('-');
    const rawName = contact.companyName || personName || 'contact';
    const name = rawName
      .replace(/[^a-z0-9-_]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'contact';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contact-${name}.pdf"`);
    res.send(buffer);
  }

  @Post()
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_CONTACTS_CREATE, { moduleCode: FINANCE_MODULE_CODE })
  async create(@Req() req: any, @Body() dto: CreateContactDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.create(tenant?.id as string, user?.id ?? null, dto);
  }

  @Patch(':id')
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_CONTACTS_UPDATE, { moduleCode: FINANCE_MODULE_CODE })
  async update(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateContactDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, user?.id ?? null, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_CONTACTS_DELETE, { moduleCode: FINANCE_MODULE_CODE })
  async remove(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    await this.service.softDelete(tenant?.id as string, id, user?.id ?? null);
  }
}
