import { Module } from '@nestjs/common';
import { EnvironmentModule } from '@modules/environment/environment.module';
import { NotificationsReportsModule } from '@modules/notifications-reports/notifications-reports.module';
import { RiskAssessmentModule } from '@modules/risk-assessment/risk-assessment.module';
import { JobsService } from './jobs.service';

@Module({
  imports: [EnvironmentModule, RiskAssessmentModule, NotificationsReportsModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
