import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacModule } from '../rbac/rbac.module';
import { StrategicObjective } from './strategic-objective.entity';
import { Kpi } from './kpi.entity';
import { KpiValue } from './kpi-value.entity';
import { PilotageService } from './pilotage.service';
import { StrategicObjectivesController } from './strategic-objectives.controller';
import { KpisController } from './kpis.controller';
import { KpiValuesController } from './kpi-values.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StrategicObjective, Kpi, KpiValue]), RbacModule],
  controllers: [StrategicObjectivesController, KpisController, KpiValuesController],
  providers: [PilotageService],
  exports: [PilotageService],
})
export class PilotageModule {}
