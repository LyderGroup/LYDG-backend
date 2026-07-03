import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeBonus, BonusStatus } from '../entities/employee-bonus.entity';

export interface BonusFilters {
  employeeId?: string;
  periodMonth?: number;
  periodYear?: number;
  status?: BonusStatus;
}

@Injectable()
export class BonusService {
  constructor(
    @InjectRepository(EmployeeBonus)
    private readonly bonusRepo: Repository<EmployeeBonus>,
  ) { }

  async listBonuses(organizationId: string, filters: BonusFilters) {
    const qb = this.bonusRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.employee', 'e')
      .where('e.organizationId = :organizationId', { organizationId })
      .orderBy('b.createdAt', 'DESC');

    if (filters.employeeId) {
      qb.andWhere('b.employeeId = :employeeId', { employeeId: filters.employeeId });
    }
    if (filters.periodMonth) {
      qb.andWhere('b.periodMonth = :periodMonth', { periodMonth: filters.periodMonth });
    }
    if (filters.periodYear) {
      qb.andWhere('b.periodYear = :periodYear', { periodYear: filters.periodYear });
    }
    if (filters.status) {
      qb.andWhere('b.status = :status', { status: filters.status });
    }

    return qb.getMany();
  }

  async getEmployeeBonuses(employeeId: string) {
    return this.bonusRepo.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  async approveBonus(bonusId: string, approvedBy: string, notes?: string): Promise<EmployeeBonus> {
    const bonus = await this.bonusRepo.findOne({ where: { id: bonusId } });
    if (!bonus) {
      throw new Error('Bonus non trouvé');
    }
    if (bonus.status === 'cancelled') {
      throw new Error('Impossible d\'approuver un bonus annulé');
    }
    if (bonus.status === 'approved' || bonus.status === 'paid') {
      throw new Error('Bonus déjà approuvé');
    }

    bonus.status = 'approved' as BonusStatus;
    bonus.approvedBy = approvedBy;
    bonus.approvedAt = new Date();
    if (notes) {
      bonus.notes = notes;
    }

    return this.bonusRepo.save(bonus);
  }

  async cancelBonus(bonusId: string, reason: string): Promise<EmployeeBonus> {
    const bonus = await this.bonusRepo.findOne({ where: { id: bonusId } });
    if (!bonus) {
      throw new Error('Bonus non trouvé');
    }
    if (bonus.status === 'paid') {
      throw new Error('Impossible d\'annuler un bonus déjà payé');
    }

    bonus.status = 'cancelled' as BonusStatus;
    bonus.notes = reason;

    return this.bonusRepo.save(bonus);
  }
}
