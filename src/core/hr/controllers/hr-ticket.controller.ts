import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { HrTicketService } from '../services/hr-ticket.service';
import { PermissionGuard } from '../../rbac/permission.guard';
import { RequirePermission } from '../../rbac/require-permission.decorator';
import { HR_PERMISSIONS } from '../hr.permissions';
import { TicketStatus } from '../entities/hr-ticket.entity';

@Controller('core/hr/tickets')
@UseGuards(PermissionGuard)
export class HrTicketController {
  constructor(private readonly ticketService: HrTicketService) { }


  @Get('categories')
  @RequirePermission(HR_PERMISSIONS.HR_TICKET_READ_OWN, { moduleCode: 'module_c_rh' })
  async listCategories(@Req() req: any) {
    const organizationId = req.user.organizationId;
    return this.ticketService.listCategories(organizationId);
  }

  @Post('categories')
  @RequirePermission(HR_PERMISSIONS.HR_SETTINGS_WRITE, { moduleCode: 'module_c_rh' })
  async createCategory(
    @Req() req: any,
    @Body() body: {
      code: string;
      name: string;
      description?: string;
      slaHours?: number;
      slaUrgentHours?: number;
      autoAssignTo?: string;
      requiresApproval?: boolean;
    },
  ) {
    const organizationId = req.user.organizationId;
    return this.ticketService.createCategory(organizationId, body);
  }


  @Post()
  @RequirePermission(HR_PERMISSIONS.HR_TICKET_WRITE, { moduleCode: 'module_c_rh' })
  async createTicket(
    @Req() req: any,
    @Body() body: {
      subject: string;
      description: string;
      categoryId: string;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      source?: 'portal' | 'email' | 'phone' | 'chat' | 'api';
    },
  ) {
    const organizationId = req.user.organizationId;
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    return this.ticketService.createTicket(organizationId, employeeId, body);
  }

  @Get('my')
  @RequirePermission(HR_PERMISSIONS.HR_TICKET_READ_OWN, { moduleCode: 'module_c_rh' })
  async getMyTickets(@Req() req: any) {
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    return this.ticketService.getMyTickets(employeeId);
  }

  @Get('my/:id')
  @RequirePermission(HR_PERMISSIONS.HR_TICKET_READ_OWN, { moduleCode: 'module_c_rh' })
  async getMyTicket(
    @Req() req: any,
    @Param('id') ticketId: string,
  ) {
    const organizationId = req.user.organizationId;
    return this.ticketService.getTicket(ticketId, organizationId);
  }

  @Post('my/:id/rate')
  @RequirePermission(HR_PERMISSIONS.HR_TICKET_READ_OWN, { moduleCode: 'module_c_rh' })
  async rateTicket(
    @Req() req: any,
    @Param('id') ticketId: string,
    @Body() body: { rating: number; comment?: string },
  ) {
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    return this.ticketService.rateTicket(
      ticketId,
      employeeId,
      body.rating,
      body.comment,
    );
  }


  @Get('all')
  @RequirePermission(HR_PERMISSIONS.HR_TICKET_READ_ALL, { moduleCode: 'module_c_rh' })
  async listTickets(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('categoryId') categoryId?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('employeeId') employeeId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const organizationId = req.user.organizationId;

    const filters: any = {};

    if (status) {
      filters.status = status.split(',');
    }

    if (priority) {
      filters.priority = priority.split(',');
    }

    if (categoryId) {
      filters.categoryId = categoryId;
    }

    if (assignedTo) {
      filters.assignedTo = assignedTo;
    }

    if (employeeId) {
      filters.employeeId = employeeId;
    }

    return this.ticketService.listTickets(organizationId, filters, {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('assigned')
  @RequirePermission(HR_PERMISSIONS.HR_TICKET_READ_ALL, { moduleCode: 'module_c_rh' })
  async getAssignedTickets(@Req() req: any) {
    const userId = req.user.id;
    return this.ticketService.getAssignedTickets(userId);
  }

  @Get(':id')
  @RequirePermission(HR_PERMISSIONS.HR_TICKET_READ_ALL, { moduleCode: 'module_c_rh' })
  async getTicket(
    @Req() req: any,
    @Param('id') ticketId: string,
  ) {
    const organizationId = req.user.organizationId;
    return this.ticketService.getTicket(ticketId, organizationId);
  }

  @Post(':id/assign')
  @RequirePermission(HR_PERMISSIONS.HR_TICKET_MANAGE, { moduleCode: 'module_c_rh' })
  async assignTicket(
    @Req() req: any,
    @Param('id') ticketId: string,
    @Body() body: { assignedTo: string },
  ) {
    const userId = req.user.id;
    return this.ticketService.assignTicket(ticketId, body.assignedTo, userId);
  }

  @Post(':id/status')
  @RequirePermission(HR_PERMISSIONS.HR_TICKET_MANAGE, { moduleCode: 'module_c_rh' })
  async updateStatus(
    @Req() req: any,
    @Param('id') ticketId: string,
    @Body() body: { status: string; notes?: string },
  ) {
    const userId = req.user.id;
    return this.ticketService.updateStatus(
      ticketId,
      body.status as any,
      userId,
      body.notes,
    );
  }

  @Post(':id/comments')
  @RequirePermission([HR_PERMISSIONS.HR_TICKET_WRITE, HR_PERMISSIONS.HR_TICKET_MANAGE], { moduleCode: 'module_c_rh' })
  async addComment(
    @Req() req: any,
    @Param('id') ticketId: string,
    @Body() body: { content: string; isInternal?: boolean; newStatus?: TicketStatus },
  ) {
    const userId = req.user.id;
    return this.ticketService.addComment(ticketId, userId, body);
  }


  @Get('dashboard/stats')
  @RequirePermission(HR_PERMISSIONS.HR_TICKET_READ_ALL, { moduleCode: 'module_c_rh' })
  async getDashboardStats(@Req() req: any) {
    const organizationId = req.user.organizationId;
    return this.ticketService.getDashboardStats(organizationId);
  }
}
