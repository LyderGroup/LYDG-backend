import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EmployeeInitiation,
  InitiationStatus,
} from '../entities/employee-initiation.entity';
import { Employee } from '../employee.entity';

interface StartInitiationInput {
  employeeId: string;
}

interface SubmitQuizInput {
  employeeId: string;
  score: number;
}

interface AssignSponsorInput {
  employeeId: string;
  sponsorId: string;
}

interface CompleteStepInput {
  employeeId: string;
  step: string;
  notes?: string;
  documentUrl?: string;
}

const QUIZ_PASSING_SCORE = 8;
const MAX_QUIZ_ATTEMPTS = 3;

@Injectable()
export class EmployeeInitiationService {
  constructor(
    @InjectRepository(EmployeeInitiation)
    private readonly initiationRepo: Repository<EmployeeInitiation>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  async getOrCreateInitiation(employeeId: string): Promise<EmployeeInitiation> {
    let initiation = await this.initiationRepo.findOne({
      where: { employeeId },
    });

    if (!initiation) {
      initiation = this.initiationRepo.create({
        employeeId,
        status: InitiationStatus.PENDING,
        currentStep: 0,
        totalSteps: 6,
      });
      await this.initiationRepo.save(initiation);
    }

    return initiation;
  }

  async startInitiation(input: StartInitiationInput): Promise<EmployeeInitiation> {
    const initiation = await this.getOrCreateInitiation(input.employeeId);

    if (initiation.status !== InitiationStatus.PENDING) {
      return initiation;
    }

    // Send manifesto (Step 1)
    initiation.manifestoSent = true;
    initiation.manifestoSentAt = new Date();
    initiation.currentStep = 1;
    initiation.status = InitiationStatus.IN_PROGRESS;
    initiation.startedAt = new Date();

    return this.initiationRepo.save(initiation);
  }

  async submitQuiz(input: SubmitQuizInput): Promise<EmployeeInitiation> {
    const initiation = await this.getOrCreateInitiation(input.employeeId);

    if (initiation.quizCompleted) {
      return initiation;
    }

    initiation.quizAttempts += 1;
    initiation.quizScore = input.score;

    if (input.score >= QUIZ_PASSING_SCORE) {
      initiation.quizCompleted = true;
      initiation.quizCompletedAt = new Date();
      initiation.currentStep = Math.max(initiation.currentStep, 2);
    }

    // If max attempts reached without passing
    if (initiation.quizAttempts >= MAX_QUIZ_ATTEMPTS && !initiation.quizCompleted) {
      initiation.status = InitiationStatus.FAILED;
    }

    return this.initiationRepo.save(initiation);
  }

  async assignSponsor(input: AssignSponsorInput): Promise<EmployeeInitiation> {
    const initiation = await this.getOrCreateInitiation(input.employeeId);

    initiation.sponsorId = input.sponsorId;
    initiation.sponsorAssignedAt = new Date();
    initiation.currentStep = Math.max(initiation.currentStep, 3);

    return this.initiationRepo.save(initiation);
  }

  async completeStep(input: CompleteStepInput): Promise<EmployeeInitiation> {
    const initiation = await this.getOrCreateInitiation(input.employeeId);

    switch (input.step) {
      case 'team_presentation':
        initiation.teamPresentationDone = true;
        initiation.teamPresentationAt = new Date();
        initiation.currentStep = Math.max(initiation.currentStep, 4);
        break;

      case 'oath_signed':
        initiation.oathSigned = true;
        initiation.oathSignedAt = new Date();
        initiation.oathDocumentUrl = input.documentUrl ?? null;
        initiation.currentStep = Math.max(initiation.currentStep, 5);
        break;

      case 'identity_element':
        initiation.identityElementReceived = true;
        initiation.identityElementAt = new Date();
        initiation.identityElementNotes = input.notes ?? null;
        initiation.currentStep = 6;
        // All steps completed
        initiation.status = InitiationStatus.COMPLETED;
        initiation.completedAt = new Date();
        break;
    }

    return this.initiationRepo.save(initiation);
  }

  async getInitiationProgress(employeeId: string) {
    const initiation = await this.getOrCreateInitiation(employeeId);

    return {
      status: initiation.status,
      currentStep: initiation.currentStep,
      totalSteps: initiation.totalSteps,
      progressPercent: Math.round((initiation.currentStep / initiation.totalSteps) * 100),
      steps: {
        manifesto: {
          completed: initiation.manifestoSent,
          completedAt: initiation.manifestoSentAt,
        },
        quiz: {
          completed: initiation.quizCompleted,
          score: initiation.quizScore,
          attempts: initiation.quizAttempts,
          passingScore: QUIZ_PASSING_SCORE,
        },
        sponsor: {
          completed: !!initiation.sponsorId,
          sponsorId: initiation.sponsorId,
          assignedAt: initiation.sponsorAssignedAt,
        },
        teamPresentation: {
          completed: initiation.teamPresentationDone,
          completedAt: initiation.teamPresentationAt,
        },
        oath: {
          completed: initiation.oathSigned,
          completedAt: initiation.oathSignedAt,
          documentUrl: initiation.oathDocumentUrl,
        },
        identityElement: {
          completed: initiation.identityElementReceived,
          completedAt: initiation.identityElementAt,
          notes: initiation.identityElementNotes,
        },
      },
      startedAt: initiation.startedAt,
      completedAt: initiation.completedAt,
    };
  }

  async getPendingInitiations(organizationId: string) {
    return this.initiationRepo
      .createQueryBuilder('init')
      .innerJoin('init.employee', 'employee')
      .innerJoin('employee.organization', 'org')
      .where('org.id = :organizationId', { organizationId })
      .andWhere('init.status != :completed', { completed: InitiationStatus.COMPLETED })
      .leftJoinAndSelect('init.employee', 'emp')
      .leftJoinAndSelect('emp.user', 'user')
      .leftJoinAndSelect('init.sponsor', 'sponsor')
      .orderBy('init.createdAt', 'DESC')
      .getMany();
  }

  async getEligibleSponsors(organizationId: string): Promise<Employee[]> {
    // Employees who have completed their own initiation can be sponsors
    const sponsors = await this.employeeRepo
      .createQueryBuilder('emp')
      .innerJoin('emp.organization', 'org')
      .leftJoin('emp.initiation', 'init')
      .where('org.id = :organizationId', { organizationId })
      .andWhere('(init.status = :completed OR init.id IS NULL)', {
        completed: InitiationStatus.COMPLETED,
      })
      .leftJoinAndSelect('emp.user', 'user')
      .getMany();

    return sponsors;
  }
}
