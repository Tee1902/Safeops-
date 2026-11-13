import { DataSource } from 'typeorm';
import {
  Assignment,
  Incident,
  Notification,
  User,
} from '../database/entities/index.js';
import { WorkflowEventsService } from './workflow-events.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { MailService } from '../notifications/mail.service.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { userId, otherId } from '../../test/fixtures.js';

describe('BE3 committed workflow deliveries', () => {
  const incident = Object.assign(new Incident(), {
    id: 'incident',
    reporterId: userId,
    status: 'VERIFIED',
    severity: 'CRITICAL',
    updatedAt: new Date(),
  });
  const assignment = Object.assign(new Assignment(), {
    id: 'assignment',
    incidentId: incident.id,
    securityUserId: otherId,
    status: 'ASSIGNED',
  });
  const notification = Object.assign(new Notification(), {
    id: 'notification',
    userId,
    incidentId: incident.id,
  });
  let gateway: { emitToRooms: jest.Mock; stopAssignment: jest.Mock };
  let mail: { enqueue: jest.Mock };
  let service: WorkflowEventsService;
  beforeEach(() => {
    gateway = {
      emitToRooms: jest.fn().mockResolvedValue(undefined),
      stopAssignment: jest.fn().mockResolvedValue(undefined),
    };
    mail = { enqueue: jest.fn() };
    const db = {
      getRepository: (type: unknown) => {
        if (type === Assignment)
          return { find: async () => [{ securityUserId: otherId }] };
        if (type === Notification) return { countBy: async () => 7 };
        if (type === User)
          return {
            find: async () => [{ id: 'admin', email: 'admin@example.com' }],
            findOneBy: async () => ({ email: 'security@example.com' }),
          };
        throw new Error('Unexpected entity');
      },
    } as unknown as DataSource;
    service = new WorkflowEventsService(
      db,
      gateway as unknown as RealtimeGateway,
      mail as unknown as MailService,
    );
  });

  it('scopes compact events to managers, the reporter and eligible assignees; targets notification owner only', async () => {
    await service.committed(
      { incident, assignment, notifications: [notification] },
      'assigned',
    );
    expect(gateway.emitToRooms).toHaveBeenCalledWith(
      expect.arrayContaining([
        'role:admin',
        'role:operator',
        `user:${userId}`,
        `user:${otherId}`,
      ]),
      'incident:updated',
      {
        incidentId: incident.id,
        status: 'VERIFIED',
        severity: 'CRITICAL',
        updatedAt: incident.updatedAt,
      },
    );
    expect(gateway.emitToRooms).toHaveBeenCalledWith(
      [`user:${userId}`],
      'notification:created',
      { notification, unreadCount: 7 },
    );
    expect(mail.enqueue).toHaveBeenCalledWith({
      to: 'security@example.com',
      incidentId: incident.id,
      kind: 'assignment',
    });
    expect(mail.enqueue).toHaveBeenCalledTimes(1);
  });
  it('sends CRITICAL alerts only on an explicit critical trigger', async () => {
    await service.committed({ incident, notifications: [] }, 'created', true);
    expect(mail.enqueue).toHaveBeenCalledWith({
      to: 'admin@example.com',
      incidentId: incident.id,
      kind: 'critical',
    });
    mail.enqueue.mockClear();
    await service.committed({ incident, notifications: [] }, 'updated');
    expect(mail.enqueue).not.toHaveBeenCalled();
  });
  it('stops consent when an assignment completes or is cancelled', async () => {
    await service.committed(
      {
        incident,
        assignment: Object.assign(new Assignment(), assignment, {
          status: 'CANCELLED',
        }),
        notifications: [],
      },
      'updated',
    );
    expect(gateway.stopAssignment).toHaveBeenCalledWith(assignment.id);
  });
  it('does not reject a committed workflow when delivery fails', async () => {
    gateway.emitToRooms.mockRejectedValue(new Error('transport unavailable'));
    await expect(
      service.committed({ incident, notifications: [] }, 'created'),
    ).resolves.toBeUndefined();
  });
  it('does not publish anything when the business transaction rolls back', async () => {
    const events = { committed: jest.fn() };
    const db = {
      transaction: jest.fn().mockRejectedValue(new Error('rollback')),
    } as unknown as DataSource;
    const incidents = new IncidentsService(
      db,
      events as unknown as WorkflowEventsService,
    );
    await expect(
      incidents.create(
        {
          title: 'Fire',
          incidentTypeId: 1,
          severity: 'CRITICAL',
          latitude: 10,
          longitude: 106,
        },
        userId,
      ),
    ).rejects.toThrow('rollback');
    expect(events.committed).not.toHaveBeenCalled();
  });
  it('waits for commit before dispatching incident events', async () => {
    let commit = false;
    const events = {
      committed: jest.fn(async () => {
        expect(commit).toBe(true);
      }),
    };
    const db = {
      transaction: jest.fn(async () => {
        await Promise.resolve();
        commit = true;
        return { incident, notifications: [notification] };
      }),
    } as unknown as DataSource;
    const incidents = new IncidentsService(
      db,
      events as unknown as WorkflowEventsService,
    );
    expect(
      await incidents.create(
        {
          title: 'Fire',
          incidentTypeId: 1,
          severity: 'CRITICAL',
          latitude: 10,
          longitude: 106,
        },
        userId,
      ),
    ).toBe(incident);
    expect(events.committed).toHaveBeenCalledWith(
      { incident, notifications: [notification] },
      'created',
      true,
    );
  });
});
