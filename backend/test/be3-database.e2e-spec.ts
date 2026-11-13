import 'reflect-metadata';
import '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { configureApplication } from '../src/setup-app.js';
import { entities } from '../src/database/entities/all-entities.js';
import {
  AuthSession,
  Incident,
  IncidentType,
  Notification,
  Role,
  User,
} from '../src/database/entities/index.js';
import { InitialSchema1794036197093 } from '../src/database/migrations/1794036197093-InitialSchema.js';
import { CreateRevokedTokens1794183728109 } from '../src/database/migrations/1794183728109-CreateRevokedTokens.js';
import { WorkflowIndexes1794211200000 } from '../src/database/migrations/1794211200000-WorkflowIndexes.js';
import { UserTokenVersion1794220000000 } from '../src/database/migrations/1794220000000-UserTokenVersion.js';
import { Be1Foundation1794300000000 } from '../src/database/migrations/1794300000000-Be1Foundation.js';
import { Be3NotificationPagination1794510000000 } from '../src/database/migrations/1794510000000-Be3NotificationPagination.js';
import { Be3IncidentPagination1794510100000 } from '../src/database/migrations/1794510100000-Be3IncidentPagination.js';
import { MailService } from '../src/notifications/mail.service.js';
import { testEnvironment } from './fixtures.js';

describe('BE3 PostgreSQL workflows and performance (isolated test schema)', () => {
  let app: NestExpressApplication | undefined;
  let control: DataSource;
  let db: DataSource;
  let apiUrl: string;
  let typeId: number;
  const schema = `be3_test_${randomUUID().replaceAll('-', '')}`;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const sockets: Socket[] = [];
  const mail = { enqueue: jest.fn() };
  const http = () => request(app!.getHttpServer());
  const auth = (role: string) => `Bearer ${tokens[role]}`;
  const body = () => ({
    title: 'BE3 test incident',
    incidentTypeId: typeId,
    severity: 'CRITICAL',
    latitude: 10.7,
    longitude: 106.6,
  });

  beforeAll(async () => {
    const url =
      process.env.TEST_DATABASE_URL ||
      'postgres://safeops_test:safeops_test_only@127.0.0.1:55432/safeops_test';
    if (!new URL(url).pathname.endsWith('_test'))
      throw new Error('Only a database ending in _test is permitted.');
    control = await new DataSource({
      type: 'postgres',
      url,
      connectTimeoutMS: 5000,
    }).initialize();
    await control.query(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
    );
    await control.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({
      type: 'postgres',
      url,
      schema,
      extra: { options: `-c search_path=${schema},public`, max: 20 },
      entities,
      migrations: [
        InitialSchema1794036197093,
        CreateRevokedTokens1794183728109,
        WorkflowIndexes1794211200000,
        UserTokenVersion1794220000000,
        Be1Foundation1794300000000,
        Be3NotificationPagination1794510000000,
        Be3IncidentPagination1794510100000,
      ],
    }).initialize();
    await db.runMigrations();
    Object.assign(process.env, testEnvironment);
    const { AppModule } = await import('../src/app.module.js');
    const { ThrottlerGuard } = await import('@nestjs/throttler');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(db)
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    apiUrl = await app.getUrl();
    const jwt = module.get(JwtService);
    for (const code of ['ADMIN', 'OPERATOR', 'REPORTER', 'SECURITY']) {
      const role = await db.getRepository(Role).findOneByOrFail({ code });
      const user = await db.getRepository(User).save({
        fullName: code,
        email: `${code.toLowerCase()}@example.com`,
        passwordHash: 'unused-test-hash',
        roleId: role.id,
        isActive: true,
        emailVerified: true,
      });
      ids[code] = user.id;
      const session = await db.getRepository(AuthSession).save({
        userId: user.id,
        refreshTokenHash: '0'.repeat(64),
        expiresAt: new Date(Date.now() + 3600000),
        revokedAt: null,
      });
      tokens[code] = await jwt.signAsync({
        sub: user.id,
        sid: session.id,
        role: code,
        type: 'access',
      });
    }
    typeId = (
      await db
        .getRepository(IncidentType)
        .save({ code: 'FIRE', name: 'Fire', isActive: true })
    ).id;
  });
  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app?.close();
    if (db?.isInitialized) await db.destroy();
    if (control?.isInitialized) {
      await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await control.destroy();
    }
  });
  const event = (
    socket: Socket,
    name: string,
    accept: (payload: Record<string, unknown>) => boolean = () => true,
  ): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const listener = (payload: Record<string, unknown>) => {
        if (!accept(payload)) return;
        clearTimeout(timeout);
        socket.off(name, listener);
        resolve(payload);
      };
      const timeout = setTimeout(() => {
        socket.off(name, listener);
        reject(new Error(`Missing event ${name}`));
      }, 2000);
      socket.on(name, listener);
    });
  async function connect(role: string) {
    const socket = io(apiUrl, {
      auth: { token: tokens[role] },
      autoConnect: false,
      forceNew: true,
      transports: ['websocket'],
    });
    sockets.push(socket);
    const ready = event(socket, 'realtime:ready');
    socket.connect();
    await ready;
    return socket;
  }

  it('commits DB state before four sessions receive creation, assignment, progress and resolution', async () => {
    const [reporter, operator, security, admin] = await Promise.all(
      ['REPORTER', 'OPERATOR', 'SECURITY', 'ADMIN'].map(connect),
    );
    const received = [reporter, operator, admin].map((socket) =>
      event(socket, 'incident:created'),
    );
    const start = performance.now();
    const created = await http()
      .post('/api/incidents')
      .set('Authorization', auth('REPORTER'))
      .send(body())
      .expect(201);
    const incidentId = created.body.data.incident.id as string;
    expect(
      (await Promise.all(received)).every(
        (payload) => payload.incidentId === incidentId,
      ),
    ).toBe(true);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(
      await db.getRepository(Incident).findOneBy({ id: incidentId }),
    ).not.toBeNull();
    expect(mail.enqueue).toHaveBeenCalledWith({
      to: 'admin@example.com',
      incidentId,
      kind: 'critical',
    });
    await http()
      .patch(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', auth('OPERATOR'))
      .send({})
      .expect(200);
    const assigned = event(security, 'assignment:created');
    const result = await http()
      .post(`/api/incidents/${incidentId}/assignments`)
      .set('Authorization', auth('OPERATOR'))
      .send({ securityUserId: ids.SECURITY })
      .expect(201);
    const assignmentId = result.body.data.id as string;
    expect(await assigned).toMatchObject({ assignmentId, incidentId });
    expect(mail.enqueue).toHaveBeenCalledWith({
      to: 'security@example.com',
      incidentId,
      kind: 'assignment',
    });
    expect(
      await security.timeout(2000).emitWithAck('security:location-sharing', {
        assignmentId,
        enabled: true,
      }),
    ).toMatchObject({ success: true });
    const location = event(operator, 'security:location');
    await security.timeout(2000).emitWithAck('security:location', {
      assignmentId,
      latitude: 10.7,
      longitude: 106.6,
    });
    expect(await location).toMatchObject({ assignmentId });
    await http()
      .patch(`/api/assignments/${assignmentId}/accept`)
      .set('Authorization', auth('SECURITY'))
      .send({})
      .expect(200);
    await http()
      .patch(`/api/assignments/${assignmentId}/start`)
      .set('Authorization', auth('SECURITY'))
      .send({})
      .expect(200);
    const cleared = event(operator, 'security:location-cleared');
    const resolved = [reporter, operator, security, admin].map((socket) =>
      event(
        socket,
        'incident:updated',
        (payload) => payload.status === 'RESOLVED',
      ),
    );
    await http()
      .patch(`/api/assignments/${assignmentId}/complete`)
      .set('Authorization', auth('SECURITY'))
      .send({})
      .expect(200);
    expect(
      (await Promise.all(resolved)).every(
        (payload) => payload.status === 'RESOLVED',
      ),
    ).toBe(true);
    expect(await cleared).toMatchObject({ assignmentId });
    expect(
      await security.timeout(2000).emitWithAck('security:location', {
        assignmentId,
        latitude: 10.7,
        longitude: 106.6,
      }),
    ).toMatchObject({ success: false });
    const notifications = await http()
      .get('/api/notifications')
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(notifications.body.data.unreadCount).toBeGreaterThan(0);
    const read = event(reporter, 'notification:read');
    await http()
      .patch('/api/notifications/read-all')
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(await read).toEqual({ unreadCount: 0 });
    for (const socket of [reporter, operator, security, admin])
      socket.disconnect();
  });

  it('rolls back incident/notifications and publishes no event or email when a DB trigger fails', async () => {
    const operator = await connect('OPERATOR');
    const received = jest.fn();
    operator.on('incident:created', received);
    const count = await db.getRepository(Incident).count();
    const notifications = await db.getRepository(Notification).count();
    mail.enqueue.mockClear();
    await db.query(
      `CREATE FUNCTION "${schema}".be3_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'rollback test'; END; $$ LANGUAGE plpgsql`,
    );
    await db.query(
      `CREATE TRIGGER be3_fail BEFORE INSERT ON "${schema}".notifications FOR EACH ROW EXECUTE FUNCTION "${schema}".be3_fail()`,
    );
    try {
      await http()
        .post('/api/incidents')
        .set('Authorization', auth('REPORTER'))
        .send(body())
        .expect(500);
      await delay(30);
      expect(await db.getRepository(Incident).count()).toBe(count);
      expect(await db.getRepository(Notification).count()).toBe(notifications);
      expect(received).not.toHaveBeenCalled();
      expect(mail.enqueue).not.toHaveBeenCalled();
    } finally {
      await db.query(`DROP TRIGGER be3_fail ON "${schema}".notifications`);
      operator.disconnect();
    }
  });

  it('measures dashboard/list API latency with 5,000 records and 20 concurrent sessions', async () => {
    const identities = ['OPERATOR'];
    const operatorRole = await db
      .getRepository(Role)
      .findOneByOrFail({ code: 'OPERATOR' });
    for (let index = 1; index < 20; index++) {
      const identity = `PERF_${index}`;
      const user = await db.getRepository(User).save({
        fullName: identity,
        email: `perf-${index}@example.com`,
        passwordHash: 'unused-test-hash',
        roleId: operatorRole.id,
        isActive: true,
        emailVerified: true,
      });
      const session = await db.getRepository(AuthSession).save({
        userId: user.id,
        refreshTokenHash: '0'.repeat(64),
        expiresAt: new Date(Date.now() + 3600000),
        revokedAt: null,
      });
      tokens[identity] = await app!.get(JwtService).signAsync({
        sub: user.id,
        sid: session.id,
        role: 'OPERATOR',
        type: 'access',
      });
      identities.push(identity);
    }
    await db.query(
      `INSERT INTO incidents (title, incident_type_id, reporter_id, latitude, longitude, severity, status)
      SELECT 'BE3 performance ' || n, $1, $2, 10.7, 106.6, 'LOW', 'PENDING' FROM generate_series(1,5000) n`,
      [typeId, ids.REPORTER],
    );
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, is_read)
      SELECT $1, 'BENCHMARK', 'BE3 performance ' || n, 'Synthetic test data', false FROM generate_series(1,5000) n`,
      [ids.OPERATOR],
    );
    const connected = await Promise.all(identities.map(connect));
    const first = await http()
      .get('/api/incidents?limit=25')
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    const second = await http()
      .get('/api/incidents?limit=25&page=2')
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    expect(first.body.data.total).toBe(5001);
    expect(first.body.data.items).toHaveLength(25);
    const firstIds = new Set(
      first.body.data.items.map((item: { id: string }) => item.id),
    );
    expect(
      second.body.data.items.some((item: { id: string }) =>
        firstIds.has(item.id),
      ),
    ).toBe(false);
    expect(first.body.data.items[0].incidentType.id).toBe(typeId);
    expect(JSON.stringify(first.body)).not.toMatch(
      /passwordHash|tokenVersion|refreshTokenHash|@example.com/,
    );
    const measurements: Record<
      string,
      { samples: number; p95Ms: number; maxMs: number }
    > = {};
    for (const path of [
      '/api/dashboard/summary',
      '/api/incidents?limit=100',
      '/api/notifications?limit=100',
    ]) {
      await http().get(path).set('Authorization', auth('OPERATOR')).expect(200);
      const samples: number[] = [];
      // 20 concurrent authenticated requests, repeated for 100 measurements per API.
      for (let batch = 0; batch < 5; batch++)
        await Promise.all(
          identities.map(async (identity) => {
            const start = performance.now();
            await http()
              .get(path)
              .set('Authorization', auth(identity))
              .expect(200);
            samples.push(performance.now() - start);
          }),
        );
      samples.sort((a, b) => a - b);
      measurements[path] = {
        samples: samples.length,
        p95Ms: Math.round(samples[Math.ceil(samples.length * 0.95) - 1]),
        maxMs: Math.round(samples.at(-1)!),
      };
    }
    for (const socket of connected) socket.disconnect();
    console.info(
      'BE3 M7-04 measurements',
      JSON.stringify({
        records: 5000,
        concurrentRequests: 20,
        sockets: 20,
        measurements,
      }),
    );
    for (const measurement of Object.values(measurements))
      expect(measurement.maxMs).toBeLessThan(500);
  });
});
