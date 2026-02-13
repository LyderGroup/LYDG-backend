import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacModule } from '../rbac/rbac.module';
import { UserRole } from '../rbac/user-role.entity';
import { Organization } from '../organizations/organizations.entity';
import { StrategicObjective } from './strategic-objective.entity';
import { Kpi } from './kpi.entity';
import { KpiValue } from './kpi-value.entity';
import { ReportExport } from './report-export.entity';
import { PilotageService } from './pilotage.service';
import { StrategicObjectivesController } from './strategic-objectives.controller';
import { KpisController } from './kpis.controller';
import { KpiValuesController } from './kpi-values.controller';
import { PilotageDashboardController } from './dashboard.controller';
import { PilotageConsolidatedDashboardController } from './dashboard-consolidated.controller';
import { PilotageReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StrategicObjective,
      Kpi,
      KpiValue,
      ReportExport,
      Organization,
      UserRole,
    ]),
    RbacModule,
  ],
  controllers: [
    StrategicObjectivesController,
    KpisController,
    KpiValuesController,
    PilotageDashboardController,
    PilotageConsolidatedDashboardController,
    PilotageReportsController,
  ],
  providers: [PilotageService],
  exports: [PilotageService],
})
export class PilotageModule {}
