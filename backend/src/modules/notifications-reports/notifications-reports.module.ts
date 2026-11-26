import { Module } from '@nestjs/common';
import { NotificationsIntegrationModule } from '@integrations/notifications/notifications-integration.module';
import { StorageModule } from '@integrations/storage/storage.module';
import { NotificationsReportsController } from './notifications-reports.controller';
import { NotificationsReportsService } from './notifications-reports.service';

@Module({
  imports: [StorageModule, NotificationsIntegrationModule],
  controllers: [NotificationsReportsController],
  providers: [NotificationsReportsService],
  exports: [NotificationsReportsService, StorageModule, NotificationsIntegrationModule],
})
export class NotificationsReportsModule {}
