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
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';
import { TicketStatus } from '../entities/hr-ticket.entity';

@Controller('core/hr/tickets')
@UseGuards(RolesGuard)
export class HrTicketController {
  constructor(private readonly ticketService: HrTicketService) { }
 

  @Get('categories')
  async listCategories(@Req() req: any) {
    const organizationId = req.user.organizationId;
    return this.ticketService.listCategories(organizationId);
  }

  @Post('categories')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
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
  async getMyTickets(@Req() req: any) {
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new ForbiddenException('Employé non trouvé');
    }

    return this.ticketService.getMyTickets(employeeId);
  }

  @Get('my/:id')
  async getMyTicket(
    @Req() req: any,
    @Param('id') ticketId: string,
  ) {
    const organizationId = req.user.organizationId;
    return this.ticketService.getTicket(ticketId, organizationId);
  }

  @Post('my/:id/rate')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async getAssignedTickets(@Req() req: any) {
    const userId = req.user.id;
    return this.ticketService.getAssignedTickets(userId);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async getTicket(
    @Req() req: any,
    @Param('id') ticketId: string,
  ) {
    const organizationId = req.user.organizationId;
    return this.ticketService.getTicket(ticketId, organizationId);
  }

  @Post(':id/assign')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async assignTicket(
    @Req() req: any,
    @Param('id') ticketId: string,
    @Body() body: { assignedTo: string },
  ) {
    const userId = req.user.id;
    return this.ticketService.assignTicket(ticketId, body.assignedTo, userId);
  }

  @Post(':id/status')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
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
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'HR_ASSISTANT')
  async addComment(
    @Req() req: any,
    @Param('id') ticketId: string,
    @Body() body: { content: string; isInternal?: boolean; newStatus?: TicketStatus },
  ) {
    const userId = req.user.id;
    return this.ticketService.addComment(ticketId, userId, body);
  }
 

  @Get('dashboard/stats')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER')
  async getDashboardStats(@Req() req: any) {
    const organizationId = req.user.organizationId;
    return this.ticketService.getDashboardStats(organizationId);
  }
}
