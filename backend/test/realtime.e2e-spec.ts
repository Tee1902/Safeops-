import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  Assignment,
  AuthSession,
  Notification,
  User,
} from '../src/database/entities/index.js';
import { RealtimeGateway } from '../src/gateway/realtime.gateway.js';
import type { RoleCode } from '../src/auth/roles.js';
import { createTestApplication } from './create-test-app.js';

describe('BE3 Socket.IO transport, authorization and reconnect', () => {
  let app: NestExpressApplication;
  let gateway: RealtimeGateway;
  let url: string;
  let jwt: JwtService;
  let duty = true;
  const assignmentId = randomUUID();
  const incidentId = randomUUID();
  const clients: Socket[] = [];
  const users = new Map<
    string,
    { id: string; role: { code: RoleCode }; email: string; isActive: boolean }
  >();
  const sessions = new Map<string, string>();
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const revoked = new Set<string>();

  beforeAll(async () => {
    const result = await createTestApplication([
      {
        token: DataSource,
        value: {
          options: { type: 'postgres' },
          entityMetadatas: [],
          isInitialized: false,
          getRepository: (entity: unknown) => {
            if (entity === AuthSession)
              return {
                findOne: async ({
                  where,
                }: {
                  where: { id: string; userId: string };
                }) =>
                  sessions.get(where.id) === where.userId &&
                  !revoked.has(where.userId)
                    ? { id: where.id }
                    : null,
              };
            if (entity === User)
              return {
                findOne: async ({ where }: { where: { id: string } }) =>
                  users.get(where.id),
              };
            if (entity === Assignment)
              return {
                findOne: async ({
                  where,
                }: {
                  where: { id: string; securityUserId: string };
                }) =>
                  duty &&
                  where.id === assignmentId &&
                  where.securityUserId === ids.SECURITY
                    ? { id: assignmentId, incidentId }
                    : null,
              };
            if (entity === Notification)
              return {
                findAndCount: async () => [[], 0],
                countBy: async () => 3,
              };
            return {};
          },
        },
      },
    ]);
    app = result.app;
    jwt = result.module.get(JwtService);
    gateway = result.module.get(RealtimeGateway);
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
    for (const name of [
      'REPORTER',
      'OPERATOR',
      'SECURITY',
      'ADMIN',
      'OUTSIDER',
    ]) {
      const id = randomUUID();
      const sid = randomUUID();
      ids[name] = id;
      const role = (name === 'OUTSIDER' ? 'REPORTER' : name) as RoleCode;
      users.set(id, {
        id,
        role: { code: role },
        email: `${name.toLowerCase()}@example.com`,
        isActive: true,
      });
      sessions.set(sid, id);
      tokens[name] = await jwt.signAsync({
        sub: id,
        sid,
        role,
        type: 'access',
      });
    }
  });
  afterAll(async () => {
    for (const client of clients) client.disconnect();
    await app?.close();
  });

  function client(token?: string, extra: object = {}) {
    const socket = io(url, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      autoConnect: false,
      forceNew: true,
      reconnectionDelay: 20,
      timeout: 2000,
      ...extra,
    });
    clients.push(socket);
    return socket;
  }
  function event<T = unknown>(socket: Socket, name: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timed out: ${name}`)),
        3000,
      );
      socket.once(name, (body: T) => {
        clearTimeout(timeout);
        resolve(body);
      });
    });
  }
  async function connect(name: string) {
    const socket = client(tokens[name]);
    const ready = event(socket, 'realtime:ready');
    socket.connect();
    expect(await ready).toEqual({ resyncRequired: true });
    return socket;
  }

  it('rejects absent, forged, expired JWTs, query tokens and untrusted origins', async () => {
    const expired = await jwt.signAsync(
      { sub: ids.REPORTER, sid: randomUUID(), type: 'access' },
      { expiresIn: -1 },
    );
    for (const socket of [
      client(),
      client('forged'),
      client(expired),
      client(undefined, { query: { token: tokens.REPORTER } }),
      client(tokens.REPORTER, {
        transports: ['websocket'],
        extraHeaders: { Origin: 'https://untrusted.example' },
      }),
    ]) {
      const rejected = event<Error>(socket, 'connect_error');
      socket.connect();
      expect(await rejected).toBeInstanceOf(Error);
      expect(socket.connected).toBe(false);
      socket.disconnect();
    }
    const polling = client(tokens.REPORTER, { transports: ['polling'] });
    const ready = event(polling, 'realtime:ready');
    polling.connect();
    expect(await ready).toEqual({ resyncRequired: true });
    polling.disconnect();
  });

  it('delivers to the four authorized sessions without exposing the event to an unrelated reporter', async () => {
    const [reporter, operator, security, admin, outsider] = await Promise.all(
      ['REPORTER', 'OPERATOR', 'SECURITY', 'ADMIN', 'OUTSIDER'].map(connect),
    );
    const leaked = jest.fn();
    outsider.on('incident:updated', leaked);
    const payload = { incidentId, status: 'ASSIGNED' };
    const received = [reporter, operator, security, admin].map((socket) =>
      event(socket, 'incident:updated'),
    );
    const start = performance.now();
    await gateway.emitToRooms(
      [
        'role:operator',
        'role:admin',
        `user:${ids.REPORTER}`,
        `user:${ids.SECURITY}`,
      ],
      'incident:updated',
      payload,
    );
    expect(await Promise.all(received)).toEqual([
      payload,
      payload,
      payload,
      payload,
    ]);
    expect(performance.now() - start).toBeLessThan(2000);
    await delay(30);
    expect(leaked).not.toHaveBeenCalled();
    for (const socket of [reporter, operator, security, admin, outsider])
      socket.disconnect();
  });

  it('requires Security consent, active duty, numeric coordinates and user-level rate limits', async () => {
    const operator = await connect('OPERATOR');
    const reporter = await connect('REPORTER');
    const security = await connect('SECURITY');
    const location = { assignmentId, latitude: 10.7, longitude: 106.6 };
    const send = (socket: Socket, name: string, body: unknown) =>
      socket.timeout(2000).emitWithAck(name, body);
    expect(await send(security, 'security:location', location)).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(
      await send(reporter, 'security:location-sharing', {
        assignmentId,
        enabled: true,
      }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(
      await send(security, 'security:location-sharing', {
        assignmentId: randomUUID(),
        enabled: true,
      }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(
      await send(security, 'security:location-sharing', {
        assignmentId,
        enabled: true,
      }),
    ).toMatchObject({ success: true });
    expect(
      await send(security, 'security:location', {
        ...location,
        latitude: '10.7',
      }),
    ).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(
      await send(security, 'security:location', {
        ...location,
        longitude: 181,
      }),
    ).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    const leaked = jest.fn();
    reporter.on('security:location', leaked);
    const received = event(operator, 'security:location');
    expect(await send(security, 'security:location', location)).toMatchObject({
      success: true,
    });
    expect(await received).toMatchObject({
      ...location,
      incidentId,
      userId: ids.SECURITY,
    });
    expect(await send(security, 'security:location', location)).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
    await send(security, 'security:location-sharing', {
      assignmentId,
      enabled: false,
    });
    await send(security, 'security:location-sharing', {
      assignmentId,
      enabled: true,
    });
    expect(await send(security, 'security:location', location)).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
    const cleared = event(operator, 'security:location-cleared');
    await gateway.stopAssignment(assignmentId);
    expect(await cleared).toMatchObject({ assignmentId });
    expect(await send(security, 'security:location', location)).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    duty = false;
    expect(
      await send(security, 'security:location-sharing', {
        assignmentId,
        enabled: true,
      }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    duty = true;
    await delay(30);
    expect(leaked).not.toHaveBeenCalled();
    for (const socket of [operator, reporter, security]) socket.disconnect();
  });

  it('automatically reconnects after transport loss, restores rooms and requests REST resync', async () => {
    const socket = await connect('REPORTER');
    const oldId = socket.id;
    const ready = event(socket, 'realtime:ready');
    gateway.server.sockets.sockets.get(oldId!)!.conn.close();
    expect(await ready).toEqual({ resyncRequired: true });
    expect(socket.id).not.toBe(oldId);
    const received = event(socket, 'notification:read');
    await gateway.emitToRooms([`user:${ids.REPORTER}`], 'notification:read', {
      unreadCount: 3,
    });
    expect(await received).toEqual({ unreadCount: 3 });
    const result = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${tokens.REPORTER}`)
      .expect(200);
    expect(result.body.data.unreadCount).toBe(3);
    socket.disconnect();
  });

  it('disconnects a revoked session before delivering the next room event', async () => {
    const socket = await connect('OUTSIDER');
    const leaked = jest.fn();
    socket.on('incident:created', leaked);
    const disconnected = event(socket, 'disconnect');
    revoked.add(ids.OUTSIDER);
    await gateway.emitToRooms([`user:${ids.OUTSIDER}`], 'incident:created', {
      incidentId,
    });
    await disconnected;
    expect(leaked).not.toHaveBeenCalled();
    socket.disconnect();
  });

  it('clears location consent on disconnect and requires a new opt-in after reconnect', async () => {
    const operator = await connect('OPERATOR');
    const security = await connect('SECURITY');
    expect(
      await security.timeout(2000).emitWithAck('security:location-sharing', {
        assignmentId,
        enabled: true,
      }),
    ).toMatchObject({ success: true });
    const cleared = event(operator, 'security:location-cleared');
    security.disconnect();
    expect(await cleared).toMatchObject({ assignmentId, userId: ids.SECURITY });
    const replacement = await connect('SECURITY');
    expect(
      await replacement.timeout(2000).emitWithAck('security:location', {
        assignmentId,
        latitude: 10.7,
        longitude: 106.6,
      }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    operator.disconnect();
    replacement.disconnect();
  });
});
