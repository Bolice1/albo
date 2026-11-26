import { Module } from '@nestjs/common';
import {
  NOTIFICATION_CHANNEL_ADAPTER,
  SandboxExternalNotificationAdapter,
} from './notification-channel.adapter';

@Module({
  providers: [
    SandboxExternalNotificationAdapter,
    {
      provide: NOTIFICATION_CHANNEL_ADAPTER,
      useExisting: SandboxExternalNotificationAdapter,
    },
  ],
  exports: [NOTIFICATION_CHANNEL_ADAPTER, SandboxExternalNotificationAdapter],
})
export class NotificationsIntegrationModule {}
