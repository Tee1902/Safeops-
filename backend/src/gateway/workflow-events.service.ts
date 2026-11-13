import { Injectable, Logger } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import {
  Assignment,
  Incident,
  Notification,
  User,
} from '../database/entities/index.js';
import { RealtimeGateway, managementRooms } from './realtime.gateway.js';
import { MailService } from '../notifications/mail.service.js';

export interface CommittedChange {
  incident: Incident;
  notifications: Notification[];
  assignment?: Assignment;
}

@Injectable()
export class WorkflowEventsService {
  private readonly logger = new Logger(WorkflowEventsService.name);
  constructor(
    private readonly db: DataSource,
    private readonly gateway: RealtimeGateway,
    private readonly mail: MailService,
  ) {}

  /** Call only after await DataSource.transaction(...) has resolved. */
  async committed(
    change: CommittedChange,
    action: 'created' | 'updated' | 'assigned',
    criticalAlert = false,
  ) {
    try {
      const { incident, assignment, notifications } = change;
      if (assignment && ['COMPLETED', 'CANCELLED'].includes(assignment.status))
        await this.gateway.stopAssignment(assignment.id);
      const visible = await this.db.getRepository(Assignment).find({
        where: {
          incidentId: incident.id,
          status: In(['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED']),
          securityUser: { isActive: true, role: { code: 'SECURITY' } },
        },
        select: { securityUserId: true },
      });
      const rooms = [
        ...managementRooms,
        `user:${incident.reporterId}`,
        ...visible.map((item) => `user:${item.securityUserId}`),
      ];
      await this.gateway.emitToRooms(
        rooms,
        action === 'created' ? 'incident:created' : 'incident:updated',
        {
          incidentId: incident.id,
          status: incident.status,
          severity: incident.severity,
          updatedAt: incident.updatedAt,
        },
      );
      if (assignment)
        await this.gateway.emitToRooms(
          [...rooms, `user:${assignment.securityUserId}`],
          action === 'assigned' ? 'assignment:created' : 'assignment:updated',
          {
            assignmentId: assignment.id,
            incidentId: incident.id,
            status: assignment.status,
          },
        );
      for (const notification of notifications) {
        const unreadCount = await this.db
          .getRepository(Notification)
          .countBy({ userId: notification.userId, isRead: false });
        await this.gateway.emitToRooms(
          [`user:${notification.userId}`],
          'notification:created',
          { notification, unreadCount },
        );
      }
      const mailIds = new Set<string>();
      if (criticalAlert && incident.severity === 'CRITICAL') {
        const managers = await this.db
          .getRepository(User)
          .find({
            where: {
              isActive: true,
              role: { code: In(['ADMIN', 'OPERATOR']) },
            },
          });
        for (const manager of managers) {
          mailIds.add(manager.id);
          this.mail.enqueue({
            to: manager.email,
            incidentId: incident.id,
            kind: 'critical',
          });
        }
      }
      if (
        action === 'assigned' &&
        assignment &&
        !mailIds.has(assignment.securityUserId)
      ) {
        const security = await this.db
          .getRepository(User)
          .findOneBy({
            id: assignment.securityUserId,
            isActive: true,
            role: { code: 'SECURITY' },
          });
        if (security)
          this.mail.enqueue({
            to: security.email,
            incidentId: incident.id,
            kind: 'assignment',
          });
      }
    } catch {
      this.logger.error(
        'Post-commit delivery failed; REST remains the source of truth',
      );
    }
  }
}
