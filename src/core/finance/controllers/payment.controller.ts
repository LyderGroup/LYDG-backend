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
import { PaymentService } from '../services/payment.service';
import { FinancePdfService } from '../services/finance-pdf.service';
import { CreatePaymentDto, UpdatePaymentDto } from '../dto/payment.dto';
import { FINANCE_MODULE_CODE, FINANCE_PERMISSIONS } from '../finance.permissions';
import { PaymentStatus } from '../entities/payment.entity';

const VALID_STATUSES: PaymentStatus[] = ['pending', 'received', 'reconciled', 'refunded', 'cancelled'];

@UseGuards(PermissionGuard)
@Controller('core/finance/payments')
export class PaymentController {
  constructor(
    private readonly service: PaymentService,
    private readonly pdf: FinancePdfService,
  ) {}

  @Get()
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_PAYMENTS_READ, { moduleCode: FINANCE_MODULE_CODE })
  async list(@Req() req: any, @Query() query: any) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findPage(tenant?.id as string, {
      page: query.page ? parseInt(query.page as string, 10) : undefined,
      limit: query.limit ? parseInt(query.limit as string, 10) : undefined,
      search: typeof query.search === 'string' ? query.search.trim() : undefined,
      status: VALID_STATUSES.includes(query.status) ? (query.status as PaymentStatus) : undefined,
      invoiceId: typeof query.invoiceId === 'string' ? query.invoiceId : undefined,
      contactId: typeof query.contactId === 'string' ? query.contactId : undefined,
      from: typeof query.from === 'string' ? query.from : undefined,
      to: typeof query.to === 'string' ? query.to : undefined,
    });
  }

  @Get(':id')
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_PAYMENTS_READ, { moduleCode: FINANCE_MODULE_CODE })
  async findOne(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    return this.service.findOne(tenant?.id as string, id);
  }

  @Get(':id/pdf')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_PAYMENTS_READ, { moduleCode: FINANCE_MODULE_CODE })
  async downloadPdf(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const payment = await this.service.findOne(tenant?.id as string, id);
    const buffer = await this.pdf.renderPayment(payment);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="paiement-${payment.paymentNumber}.pdf"`,
    );
    res.send(buffer);
  }

  @Post()
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_PAYMENTS_CREATE, { moduleCode: FINANCE_MODULE_CODE })
  async create(@Req() req: any, @Body() dto: CreatePaymentDto) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.create(tenant?.id as string, user?.id ?? null, dto);
  }

  @Patch(':id')
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_PAYMENTS_UPDATE, { moduleCode: FINANCE_MODULE_CODE })
  async update(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.update(tenant?.id as string, id, user?.id ?? null, dto);
  }

  @Post(':id/reconcile')
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_PAYMENTS_RECONCILE, { moduleCode: FINANCE_MODULE_CODE })
  async reconcile(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    return this.service.reconcile(tenant?.id as string, id, user?.id ?? null);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(FINANCE_PERMISSIONS.FINANCE_PAYMENTS_DELETE, { moduleCode: FINANCE_MODULE_CODE })
  async remove(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenant = req.tenant as { id?: string } | undefined;
    const user = req.user as { id?: string } | undefined;
    await this.service.softDelete(tenant?.id as string, id, user?.id ?? null);
  }
}
