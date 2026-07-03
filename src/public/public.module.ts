/**
 * Module: Public
 * 
 * Module parent pour tous les modules publics (API sans authentification)
 */

import { Module } from '@nestjs/common';
import { PublicCareersModule } from './careers/public-careers.module';

@Module({
  imports: [PublicCareersModule],
  exports: [PublicCareersModule],
})
export class PublicModule {}
