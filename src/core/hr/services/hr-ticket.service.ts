import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, Not } from 'typeorm';
import { HrTicket, TicketStatus, TicketPriority } from '../entities/hr-ticket.entity';
import { HrTicketComment } from '../entities/hr-ticket-comment.entity';
import { HrTicketCategory } from '../entities/hr-ticket-category.entity';
import { Employee } from '../employee.entity';
import { User } from '../../users/user.entity';

export interface CreateTicketInput {
  subject: string;
  description: string;
  categoryId: string;
  priority?: TicketPriority;
  source?: 'portal' | 'email' | 'phone' | 'chat' | 'api';
}

export interface AddCommentInput {
  content: string;
  isInternal?: boolean;
  newStatus?: TicketStatus;
}

@Injectable()
export class HrTicketService {
  constructor(
    @InjectRepository(HrTicket)
    private readonly ticketRepo: Repository<HrTicket>,
    @InjectRepository(HrTicketComment)
    private readonly commentRepo: Repository<HrTicketComment>,
    @InjectRepository(HrTicketCategory)
    private readonly categoryRepo: Repository<HrTicketCategory>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly dataSource: DataSource,
  ) {}

  // ==================== CATÉGORIES ====================

  async listCategories(organizationId: string): Promise<HrTicketCategory[]> {
    return this.categoryRepo.find({
      where: { organizationId, isActive: true, deletedAt: IsNull() as any },
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
  }

  async createCategory(
    organizationId: string,
    input: {
      code: string;
      name: string;
      description?: string;
      slaHours?: number;
      slaUrgentHours?: number;
      autoAssignTo?: string;
      requiresApproval?: boolean;
    },
  ): Promise<HrTicketCategory> {
    const category = this.categoryRepo.create({
      organizationId,
      ...input,
    });

    return this.categoryRepo.save(category);
  }

  // ==================== TICKETS ====================

  async createTicket(
    organizationId: string,
    employeeId: string,
    input: CreateTicketInput,
  ): Promise<HrTicket> {
    const category = await this.categoryRepo.findOne({
      where: { id: input.categoryId, organizationId },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    // Calculer la date d'échéance
    const slaHours = input.priority === 'urgent' 
      ? category.slaUrgentHours 
      : category.slaHours;
    
    const dueDate = new Date();
    dueDate.setHours(dueDate.getHours() + slaHours);

    const ticket = this.ticketRepo.create({
      organizationId,
      employeeId,
      categoryId: input.categoryId,
      subject: input.subject,
      description: input.description,
      priority: input.priority ?? 'normal',
      source: input.source ?? 'portal',
      status: 'open' as TicketStatus,
      dueDate,
      assignedTo: category.autoAssignTo ?? null,
      assignedAt: category.autoAssignTo ? new Date() : null,
    });

    const saved = await this.ticketRepo.save(ticket);

    // Créer un commentaire initial
    await this.commentRepo.save({
      ticketId: saved.id,
      authorId: null,
      authorType: 'SYSTEM',
      authorName: 'Système',
      content: `Ticket créé via ${input.source ?? 'portail'}`,
      isInternal: false,
      oldStatus: null,
      newStatus: 'open',
    });

    return saved;
  }

  async getTicket(ticketId: string, organizationId: string): Promise<HrTicket | null> {
    return this.ticketRepo.findOne({
      where: { id: ticketId, organizationId, deletedAt: IsNull() as any },
      relations: ['employee', 'comments', 'comments.author', 'category', 'assignee'],
      order: {
        'comments': { createdAt: 'ASC' },
      } as any,
    });
  }

  async listTickets(
    organizationId: string,
    filters?: {
      status?: TicketStatus[];
      priority?: TicketPriority[];
      categoryId?: string;
      assignedTo?: string;
      employeeId?: string;
    },
    pagination?: { page: number; limit: number },
  ): Promise<{ tickets: HrTicket[]; total: number }> {
    const query = this.ticketRepo
      .createQueryBuilder('t')
      .where('t.organizationId = :orgId', { orgId: organizationId })
      .andWhere('t.deletedAt IS NULL');

    if (filters?.status?.length) {
      query.andWhere('t.status IN (:...statuses)', { statuses: filters.status });
    }

    if (filters?.priority?.length) {
      query.andWhere('t.priority IN (:...priorities)', { priorities: filters.priority });
    }

    if (filters?.categoryId) {
      query.andWhere('t.categoryId = :catId', { catId: filters.categoryId });
    }

    if (filters?.assignedTo) {
      query.andWhere('t.assignedTo = :assignee', { assignee: filters.assignedTo });
    }

    if (filters?.employeeId) {
      query.andWhere('t.employeeId = :empId', { empId: filters.employeeId });
    }

    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    const [tickets, total] = await query
      .orderBy('t.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { tickets, total };
  }

  async assignTicket(
    ticketId: string,
    assignedTo: string,
    assignedBy: string,
  ): Promise<HrTicket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket non trouvé');
    }

    const oldStatus = ticket.status;
    ticket.assignedTo = assignedTo;
    ticket.assignedAt = new Date();

    if (ticket.status === 'open') {
      ticket.status = 'in_progress';
    }

    const saved = await this.ticketRepo.save(ticket);

    // Commentaire
    await this.addComment(ticketId, assignedBy, {
      content: `Ticket assigné à un agent RH`,
      isInternal: true,
      newStatus: ticket.status,
    });

    return saved;
  }

  async updateStatus(
    ticketId: string,
    newStatus: TicketStatus,
    userId: string,
    notes?: string,
  ): Promise<HrTicket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket non trouvé');
    }

    const oldStatus = ticket.status;
    ticket.status = newStatus;

    if (newStatus === 'resolved') {
      ticket.resolvedBy = userId;
      ticket.resolvedAt = new Date();
      ticket.resolutionNotes = notes ?? null;
    }

    const saved = await this.ticketRepo.save(ticket);

    // Commentaire
    await this.addComment(ticketId, userId, {
      content: notes ?? `Statut changé: ${oldStatus} → ${newStatus}`,
      isInternal: false,
      newStatus,
    });

    return saved;
  }

  async addComment(
    ticketId: string,
    userId: string,
    input: AddCommentInput,
  ): Promise<HrTicketComment> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket non trouvé');
    }

    // Premier réponse
    if (!ticket.firstResponseAt && !input.isInternal) {
      ticket.firstResponseAt = new Date();
      await this.ticketRepo.save(ticket);
    }

    const oldStatus = ticket.status;

    if (input.newStatus && input.newStatus !== oldStatus) {
      ticket.status = input.newStatus;
      await this.ticketRepo.save(ticket);
    }

    const comment = this.commentRepo.create({
      ticketId,
      authorId: userId,
      authorType: 'HR',
      content: input.content,
      isInternal: input.isInternal ?? false,
      oldStatus,
      newStatus: input.newStatus ?? oldStatus,
    });

    return this.commentRepo.save(comment);
  }

  async rateTicket(
    ticketId: string,
    employeeId: string,
    rating: number,
    comment?: string,
  ): Promise<HrTicket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId, employeeId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket non trouvé');
    }

    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      throw new BadRequestException('Le ticket doit être résolu pour être noté');
    }

    ticket.satisfactionRating = rating;
    ticket.satisfactionComment = comment ?? null;

    return this.ticketRepo.save(ticket);
  }

  // ==================== TABLEAU DE BORD ====================

  async getDashboardStats(organizationId: string): Promise<{
    open: number;
    inProgress: number;
    waiting: number;
    resolved: number;
    overdue: number;
    avgResolutionTime: number;
  }> {
    const tickets = await this.ticketRepo.find({
      where: { organizationId, deletedAt: IsNull() as any },
    });

    const now = new Date();
    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const t of tickets) {
      if (t.resolvedAt && t.createdAt) {
        totalResolutionTime += 
          (t.resolvedAt.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60);
        resolvedCount++;
      }
    }

    return {
      open: tickets.filter(t => t.status === 'open').length,
      inProgress: tickets.filter(t => 
        ['in_progress', 'waiting_employee', 'waiting_manager', 'waiting_external'].includes(t.status)
      ).length,
      waiting: tickets.filter(t => 
        ['waiting_employee', 'waiting_manager', 'waiting_external'].includes(t.status)
      ).length,
      resolved: tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length,
      overdue: tickets.filter(t => 
        !['resolved', 'closed'].includes(t.status) && 
        t.dueDate && 
        new Date(t.dueDate) < now
      ).length,
      avgResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
    };
  }

  async getMyTickets(employeeId: string): Promise<HrTicket[]> {
    return this.ticketRepo.find({
      where: { employeeId, deletedAt: IsNull() as any },
      relations: ['category'],
      order: { createdAt: 'DESC' },
    });
  }

  async getAssignedTickets(userId: string): Promise<HrTicket[]> {
    return this.ticketRepo.find({
      where: { assignedTo: userId, deletedAt: IsNull() as any },
      relations: ['employee', 'category'],
      order: { dueDate: 'ASC' },
    });
  }
}
