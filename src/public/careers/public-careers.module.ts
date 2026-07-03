/**
 * Module: Public Careers
 * 
 * Module indépendant pour la gestion de l'API publique des offres d'emploi
 * Endpoints publics sans authentification
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublicCareersController } from './public-careers.controller';
import { PublicCareersService } from './public-careers.service';
import { JobOpening } from '../../core/hr/entities/job-opening.entity';
import { Candidate } from '../../core/hr/entities/candidate.entity';
import { JobApplication } from '../../core/hr/entities/job-application.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JobOpening,
      Candidate,
      JobApplication,
    ]),
  ],
  controllers: [PublicCareersController],
  providers: [PublicCareersService],
  exports: [PublicCareersService],
})
export class PublicCareersModule {}
