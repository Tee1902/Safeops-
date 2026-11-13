import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AssignmentsController } from './assignments.controller.js';
import { AssignmentsService } from './assignments.service.js';
import { WorkflowEventsModule } from '../gateway/workflow-events.module.js';
@Module({
  imports: [AuthModule, WorkflowEventsModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}
