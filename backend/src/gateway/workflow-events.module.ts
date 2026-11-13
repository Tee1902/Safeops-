import { Module } from '@nestjs/common';
import { GatewayModule } from './gateway.module.js';
import { WorkflowEventsService } from './workflow-events.service.js';
import { MailService } from '../notifications/mail.service.js';

@Module({
  imports: [GatewayModule],
  providers: [WorkflowEventsService, MailService],
  exports: [WorkflowEventsService],
})
export class WorkflowEventsModule {}
