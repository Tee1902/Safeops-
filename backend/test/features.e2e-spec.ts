import 'reflect-metadata';
import '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { setTimeout as delay } from 'node:timers/promises';
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
import { VietnameseSearch1794820000000 } from '../src/database/migrations/1794820000000-VietnameseSearch.js';
import { configureApplication } from '../src/setup-app.js';
import { MailService } from '../src/notifications/mail.service.js';
import { testEnvironment } from './fixtures.js';

describe('BE2/BE3 map, Vietnamese search, statistics, export and notification synchronization (PostgreSQL)', () => {
  let app: NestExpressApplication | undefined;
  let control: DataSource;
  let db: DataSource;
  let url: string;
  let typeId: number;
  let firstId: string;
  const schema = `features_test_${randomUUID().replaceAll('-', '')}`;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const sockets: Socket[] = [];
  const http = () => request(app!.getHttpServer());
  const auth = (role: string) => `Bearer ${tokens[role]}`;
  const range = () => ({
    from: '2026-10-31T00:00:00Z',
    to: '2026-11-02T23:59:59Z',
    incidentTypeId: typeId,
  });
  beforeAll(async () => {
    const databaseUrl =
      process.env.TEST_DATABASE_URL ||
      'postgres://safeops_test:safeops_test_only@127.0.0.1:55432/safeops_test';
    if (!new URL(databaseUrl).pathname.endsWith('_test'))
      throw new Error('Only a _test database is allowed.');
    control = await new DataSource({
      type: 'postgres',
      url: databaseUrl,
      connectTimeoutMS: 5000,
    }).initialize();
    await control.query(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
    );
    await control.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      extra: { options: `-c search_path=${schema},public` },
      entities,
      migrations: [
        InitialSchema1794036197093,
        CreateRevokedTokens1794183728109,
        WorkflowIndexes1794211200000,
        UserTokenVersion1794220000000,
        Be1Foundation1794300000000,
        Be3NotificationPagination1794510000000,
        Be3IncidentPagination1794510100000,
        VietnameseSearch1794820000000,
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
      .useValue({ enqueue: jest.fn() })
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
    const jwt = module.get(JwtService);
    for (const name of [
      'ADMIN',
      'OPERATOR',
      'REPORTER',
      'SECURITY',
      'OUTSIDER',
    ]) {
      const role = await db
        .getRepository(Role)
        .findOneByOrFail({ code: name === 'OUTSIDER' ? 'REPORTER' : name });
      const user = await db
        .getRepository(User)
        .save({
          fullName: name,
          email: `${name}@example.com`,
          passwordHash: 'private-hash',
          roleId: role.id,
          isActive: true,
          emailVerified: true,
        });
      ids[name] = user.id;
      const session = await db
        .getRepository(AuthSession)
        .save({
          userId: user.id,
          refreshTokenHash: '0'.repeat(64),
          expiresAt: new Date(Date.now() + 3600000),
        });
      tokens[name] = await jwt.signAsync({
        sub: user.id,
        sid: session.id,
        role: role.code,
        type: 'access',
      });
    }
    typeId = (
      await db
        .getRepository(IncidentType)
        .save({ code: 'FIRE', name: 'Cháy', isActive: true })
    ).id;
    const fixtures = [
      {
        title: 'Đám cháy tại đường Nguyễn Huệ 100%',
        status: 'RESOLVED',
        severity: 'HIGH',
        latitude: '10.7000000',
        longitude: '106.6000000',
        createdAt: new Date('2026-10-31T17:30:00Z'),
        verifiedAt: new Date('2026-10-31T17:32:00Z'),
        resolvedAt: new Date('2026-10-31T17:40:00Z'),
      },
      {
        title: 'Sự cố đang chờ',
        status: 'PENDING',
        severity: 'LOW',
        latitude: '10.8000000',
        longitude: '106.8000000',
        createdAt: new Date('2026-11-01T17:30:00Z'),
      },
      {
        title: 'East',
        status: 'VERIFIED',
        severity: 'HIGH',
        latitude: '0.0000000',
        longitude: '179.0000000',
        createdAt: new Date('2026-10-31T16:30:00Z'),
        verifiedAt: new Date('2026-10-31T16:34:00Z'),
      },
      {
        title: 'West',
        status: 'PENDING',
        severity: 'CRITICAL',
        latitude: '0.0000000',
        longitude: '-179.0000000',
        createdAt: new Date('2026-11-01T17:30:00Z'),
      },
    ];
    for (const [index, fixture] of fixtures.entries()) {
      const item = await db
        .getRepository(Incident)
        .save({
          ...fixture,
          reporterId: index === 1 ? ids.OUTSIDER : ids.REPORTER,
          incidentTypeId: typeId,
        });
      if (!index) firstId = item.id;
    }
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
  it.each([
    'dam chay',
    'ĐÁM CHÁY',
    'đám cháy'.normalize('NFD'),
    'duong nguyen hue',
    '100%',
  ])('searches Vietnamese accents and literal text: %s', async (search) => {
    const response = await http()
      .get('/api/incidents')
      .query({ ...range(), search })
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    expect(response.body.data.total).toBe(1);
    expect(response.body.data.items[0].id).toBe(firstId);
  });
  it('treats SQL-looking search and wildcard characters literally', async () => {
    for (const search of ["' OR 1=1 --", '100_', '%', '\\']) {
      const response = await http()
        .get('/api/incidents')
        .query({ ...range(), search })
        .set('Authorization', auth('ADMIN'))
        .expect(200);
      expect(response.body.data.total).toBe(search === '%' ? 1 : 0);
    }
  });
  it('filters list/map identically and never expands Reporter or Security scope', async () => {
    for (const route of ['/api/incidents', '/api/incidents/map']) {
      const bounds = { south: 10.7, north: 10.8, west: 106.6, east: 106.8 };
      for (const role of ['REPORTER', 'SECURITY', 'OPERATOR']) {
        const response = await http()
          .get(route)
          .query({ ...range(), ...bounds })
          .set('Authorization', auth(role))
          .expect(200);
        expect(response.body.data.total).toBe(
          role === 'REPORTER' ? 1 : role === 'SECURITY' ? 0 : 2,
        );
      }
    }
    const response = await http()
      .get('/api/incidents/map')
      .query({ ...range(), search: 'dam chay' })
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(response.body.data.items[0]).toMatchObject({
      id: firstId,
      latitude: 10.7,
      longitude: 106.6,
    });
    expect(response.body.data.items[0]).not.toHaveProperty('reporterId');
    expect(response.body.data.items[0]).not.toHaveProperty('description');
  });
  it('supports antimeridian viewports with stable pagination', async () => {
    const query = {
      ...range(),
      south: -10,
      north: 10,
      west: 170,
      east: -170,
      limit: 1,
    };
    const first = await http()
      .get('/api/incidents/map')
      .query(query)
      .set('Authorization', auth('ADMIN'))
      .expect(200);
    const second = await http()
      .get('/api/incidents/map')
      .query({ ...query, page: 2 })
      .set('Authorization', auth('ADMIN'))
      .expect(200);
    expect(first.body.data.total).toBe(2);
    expect(first.body.data.items[0].id).not.toBe(second.body.data.items[0].id);
  });
  it('validates map bounds and pagination before querying', async () => {
    for (const query of [
      { south: 10 },
      { south: '', north: 10, west: 0, east: 180 },
      { south: 20, north: 10, west: 100, east: 110 },
      { south: -91, north: 20, west: 0, east: 180 },
      { page: 0 },
      { limit: 101 },
    ])
      await http()
        .get('/api/incidents/map')
        .query(query)
        .set('Authorization', auth('ADMIN'))
        .expect(400);
  });
  it('aggregates real SQL counts, local midnight buckets and only completed timing samples', async () => {
    const response = await http()
      .get('/api/dashboard/statistics')
      .query(range())
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    expect(response.body.data).toMatchObject({
      total: 4,
      timezone: 'Asia/Saigon',
      granularity: 'day',
      byStatus: { RESOLVED: 1, PENDING: 2, VERIFIED: 1, CLOSED: 0 },
      bySeverity: { HIGH: 2, LOW: 1, CRITICAL: 1, MEDIUM: 0 },
      byType: [{ id: typeId, code: 'FIRE', name: 'Cháy', count: 4 }],
      trend: [
        { period: '2026-10-31', count: 1 },
        { period: '2026-11-01', count: 1 },
        { period: '2026-11-02', count: 2 },
      ],
      responseTimes: {
        verification: { samples: 2, averageSeconds: 180 },
        resolution: { samples: 1, averageSeconds: 600 },
      },
    });
    const monthly = await http()
      .get('/api/dashboard/statistics')
      .query({ ...range(), granularity: 'month' })
      .set('Authorization', auth('ADMIN'))
      .expect(200);
    expect(monthly.body.data.trend).toEqual([
      { period: '2026-10', count: 1 },
      { period: '2026-11', count: 3 },
    ]);
  });
  it('keeps statistics filters consistent and handles empty results', async () => {
    const filtered = await http()
      .get('/api/dashboard/statistics')
      .query({ ...range(), severity: 'HIGH' })
      .set('Authorization', auth('ADMIN'))
      .expect(200);
    expect(filtered.body.data.total).toBe(2);
    const empty = await http()
      .get('/api/dashboard/statistics')
      .query({ ...range(), status: 'CLOSED' })
      .set('Authorization', auth('ADMIN'))
      .expect(200);
    expect(empty.body.data).toMatchObject({
      total: 0,
      byType: [],
      trend: [],
      responseTimes: { resolution: { samples: 0, averageSeconds: null } },
    });
    await http()
      .get('/api/dashboard/statistics')
      .query({ from: '2026-11-02', to: '2026-11-01' })
      .set('Authorization', auth('ADMIN'))
      .expect(400);
    await http()
      .get('/api/dashboard/statistics?granularity=year')
      .set('Authorization', auth('ADMIN'))
      .expect(400);
    await http()
      .get('/api/dashboard/statistics?from=2026-11-01T00:00:00')
      .set('Authorization', auth('ADMIN'))
      .expect(400);
  });
  it.each(['/api/dashboard/statistics', '/api/incidents/export'])(
    'protects management API %s',
    async (route) => {
      await http().get(route).expect(401);
      for (const role of ['REPORTER', 'SECURITY'])
        await http().get(route).set('Authorization', auth(role)).expect(403);
    },
  );
  it('exports UTF-8 CSV, quotes data and protects spreadsheet formulas', async () => {
    const item = await db
      .getRepository(Incident)
      .save({
        title: '=HYPERLINK("bad")',
        address: 'Đường A, "B"\nC',
        status: 'PENDING',
        severity: 'LOW',
        reporterId: ids.REPORTER,
        incidentTypeId: typeId,
        latitude: '10.7',
        longitude: '106.6',
      });
    const response = await http()
      .get('/api/incidents/export')
      .query({ format: 'csv', search: 'HYPERLINK' })
      .set('Authorization', auth('ADMIN'))
      .expect(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain(
      'safeops-incidents.csv',
    );
    expect(response.text).toContain("'=HYPERLINK");
    expect(response.text).toContain('Đường A, ""B""\nC');
    expect(response.text).not.toContain('private-hash');
    await db.getRepository(Incident).delete(item.id);
  });
  it('generates a real Excel workbook with matching numeric coordinates and filtered rows', async () => {
    const response = await http()
      .get('/api/incidents/export')
      .query({ ...range(), format: 'xlsx', search: 'dam chay' })
      .set('Authorization', auth('OPERATOR'))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getCell('A2').value).toBe(firstId);
    expect(sheet.getCell('F2').value).toBe(10.7);
    expect(sheet.getCell('B2').type).toBe(ExcelJS.ValueType.String);
    await http()
      .get('/api/incidents/export?format=pdf')
      .set('Authorization', auth('ADMIN'))
      .expect(400);
  });
  async function connect(role: string) {
    const socket = io(url, {
      auth: { token: tokens[role] },
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
    });
    sockets.push(socket);
    const ready = new Promise<void>((resolve, reject) => {
      socket.once('realtime:ready', () => resolve());
      socket.once('connect_error', reject);
    });
    socket.connect();
    await ready;
    return socket;
  }
  function event(socket: Socket, name: string) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Missing ${name}`)),
        2000,
      );
      socket.once(name, (body) => {
        clearTimeout(timer);
        resolve(body);
      });
    });
  }
  it('synchronizes notification reads across two sessions without leaking to other users', async () => {
    const [a, b, outsider] = await Promise.all([
      connect('REPORTER'),
      connect('REPORTER'),
      connect('OUTSIDER'),
    ]);
    const leaked = jest.fn();
    outsider.on('notification:read', leaked);
    const notification = await db
      .getRepository(Notification)
      .save({
        userId: ids.REPORTER,
        incidentId: firstId,
        title: 'Test',
        message: 'Read once',
        type: 'INCIDENT_UPDATED',
        isRead: false,
      });
    const pending = [
      event(a, 'notification:read'),
      event(b, 'notification:read'),
    ];
    const read = await http()
      .patch(`/api/notifications/${notification.id}/read`)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    for (const body of await Promise.all(pending))
      expect(body).toMatchObject({
        notificationId: notification.id,
        unreadCount: 0,
        allRead: false,
        readAt: read.body.data.readAt,
      });
    const again = await http()
      .patch(`/api/notifications/${notification.id}/read`)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(again.body.data.readAt).toBe(read.body.data.readAt);
    await http()
      .patch(`/api/notifications/${notification.id}/read`)
      .set('Authorization', auth('OUTSIDER'))
      .expect(404);
    const all = event(b, 'notification:read');
    await http()
      .patch('/api/notifications/read-all')
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(await all).toMatchObject({ allRead: true, unreadCount: 0 });
    await delay(50);
    expect(leaked).not.toHaveBeenCalled();
    for (const socket of [a, b, outsider]) socket.disconnect();
  });
});
