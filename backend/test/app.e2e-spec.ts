import 'reflect-metadata';
import '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApplication } from '../src/setup-app.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { testEnvironment } from './fixtures.js';
import { Be1Foundation1794300000000 } from '../src/database/migrations/1794300000000-Be1Foundation.js';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// Use Nest/TypeORM code emitted by tsc, including its decorator metadata.
import * as entities from '../src/database/entities/index.js';
import { InitialSchema1794036197093 } from '../src/database/migrations/1794036197093-InitialSchema.js';
import { CreateRevokedTokens1794183728109 } from '../src/database/migrations/1794183728109-CreateRevokedTokens.js';
import { WorkflowIndexes1794211200000 } from '../src/database/migrations/1794211200000-WorkflowIndexes.js';
import { UserTokenVersion1794220000000 } from '../src/database/migrations/1794220000000-UserTokenVersion.js';

describe('SafeOps workflow against PostgreSQL', () => {
  let app: INestApplication | undefined;
  let control: DataSource;
  let db: DataSource;
  let uploadDir: string;
  const schema = `workflow_test_${randomUUID().replaceAll('-', '')}`;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const password = 'WorkflowTest123!';
  let fireId: number;
  let otherId: number;
  let incidentId: string;
  let assignmentId: string;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hAAAAABJRU5ErkJggg==',
    'base64',
  );
  let testUrl: string;
  const http = () => request(app!.getHttpServer());
  const auth = (role: string) => `Bearer ${tokens[role]}`;
  const incidentBody = (title = 'Fire at building A') => ({
    title,
    description: 'Smoke on ground floor',
    incidentTypeId: fireId,
    latitude: 10.7,
    longitude: 106.6,
    address: 'Building A',
    severity: 'HIGH',
  });
  async function createIncident(title?: string) {
    const result = await http()
      .post('/api/incidents')
      .set('Authorization', auth('REPORTER'))
      .send(incidentBody(title))
      .expect(201);
    return result.body.data.incident.id as string;
  }

  beforeAll(async () => {
    const url =
      process.env.TEST_DATABASE_URL ||
      'postgres://safeops_test:safeops_test_only@127.0.0.1:55432/safeops_test';
    testUrl = url;
    if (!new URL(url).pathname.endsWith('_test'))
      throw new Error('TEST_DATABASE_URL must use a database ending in _test.');
    control = new DataSource({ type: 'postgres', url, connectTimeoutMS: 5000 });
    await control.initialize();
    await control.query(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
    );
    await control.query(`CREATE SCHEMA "${schema}"`);
    db = new DataSource({
      type: 'postgres',
      url,
      schema,
      extra: { options: `-c search_path=${schema},public` },
      entities: Object.values(entities),
      migrations: [
        InitialSchema1794036197093,
        CreateRevokedTokens1794183728109,
        WorkflowIndexes1794211200000,
        UserTokenVersion1794220000000,
        Be1Foundation1794300000000,
      ],
    });
    await db.initialize();
    await db.runMigrations();
    uploadDir = await mkdtemp(join(tmpdir(), 'safeops-e2e-'));
    Object.assign(process.env, testEnvironment);
    process.env.UPLOAD_DIR = uploadDir;
    // Supply test-only configuration even if the checkout has no .env.
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '55432';
    process.env.DB_USERNAME = 'safeops_test';
    process.env.DB_PASSWORD = 'safeops_test_only';
    process.env.DB_DATABASE = 'safeops_test';
    process.env.DB_SYNCHRONIZE = 'false';
    process.env.JWT_SECRET =
      'safeops-workflow-test-secret-at-least-32-characters';
    const { AppModule } = await import('../src/app.module.js');
    const { ThrottlerGuard } = await import('@nestjs/throttler');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(db)
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApplication(app as NestExpressApplication);
    await app.init();
    const roles = db.getRepository(entities.Role);
    for (const code of ['ADMIN', 'OPERATOR', 'REPORTER', 'SECURITY'])
      await roles.upsert({ code, name: code, description: null }, ['code']);
    const adminRole = await roles.findOneByOrFail({ code: 'ADMIN' });
    const users = db.getRepository(entities.User);
    const admin = await users.save(
      users.create({
        fullName: 'Admin',
        email: 'admin@example.com',
        passwordHash: await bcrypt.hash(password, 4),
        roleId: adminRole.id,
        isActive: true,
        emailVerified: true,
        phone: null,
        avatarUrl: null,
        lastLoginAt: null,
      }),
    );
    ids.ADMIN = admin.id;
    const login = await http()
      .post('/api/auth/login')
      .send({ email: admin.email, password })
      .expect(200);
    tokens.ADMIN = login.body.data.accessToken;
    for (const role of ['OPERATOR', 'SECURITY', 'SECURITY2']) {
      const result = await http()
        .post('/api/users')
        .set('Authorization', auth('ADMIN'))
        .send({
          fullName: role,
          email: `${role.toLowerCase()}@example.com`,
          password,
          role: role === 'SECURITY2' ? 'SECURITY' : role,
        })
        .expect(201);
      ids[role] = result.body.data.user.id;
      const session = await http()
        .post('/api/auth/login')
        .send({ email: `${role.toLowerCase()}@example.com`, password })
        .expect(200);
      tokens[role] = session.body.data.accessToken;
    }
    for (const role of ['REPORTER', 'OUTSIDER']) {
      const result = await http()
        .post('/api/auth/register')
        .send({
          fullName: role,
          email: `${role.toLowerCase()}@example.com`,
          password,
        })
        .expect(201);
      ids[role] = result.body.data.user.id;
      const session = await http()
        .post('/api/auth/login')
        .send({ email: `${role.toLowerCase()}@example.com`, password })
        .expect(200);
      tokens[role] = session.body.data.accessToken;
    }
    const types = db.getRepository(entities.IncidentType);
    fireId = (
      await types.save(
        types.create({
          code: 'FIRE',
          name: 'Fire',
          description: null,
          icon: null,
          isActive: true,
        }),
      )
    ).id;
    otherId = (
      await types.save(
        types.create({
          code: 'OTHER',
          name: 'Other',
          description: null,
          icon: null,
          isActive: true,
        }),
      )
    ).id;
  }, 60000);

  afterAll(async () => {
    await app?.close();
    if (db?.isInitialized) await db.destroy();
    if (control?.isInitialized) {
      await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await control.destroy();
    }
    if (uploadDir && basename(uploadDir).startsWith('safeops-e2e-'))
      await rm(uploadDir, { recursive: true, force: true });
  });

  it('requires authentication and rejects privilege escalation', async () => {
    await http().get('/api/incidents').expect(401);
    await http()
      .post('/api/users')
      .set('Authorization', auth('REPORTER'))
      .send({
        fullName: 'Staff',
        email: 'staff@example.com',
        password,
        role: 'OPERATOR',
      })
      .expect(403);
    await http()
      .post('/api/auth/register')
      .send({
        fullName: 'Attacker',
        email: 'attacker@example.com',
        password,
        role: 'ADMIN',
      })
      .expect(400);
    await http()
      .post('/api/users')
      .set('Authorization', auth('ADMIN'))
      .send({
        fullName: 'Admin2',
        email: 'admin2@example.com',
        password,
        role: 'ADMIN',
      })
      .expect(400);
  });

  it('lists and manages incident types with pagination and admin permissions', async () => {
    const created = await http()
      .post('/api/incident-types')
      .set('Authorization', auth('ADMIN'))
      .send({ code: 'medical', name: 'Medical' })
      .expect(201);
    expect(created.body.data.code).toBe('MEDICAL');
    expect(created.body.data.isActive).toBe(true);
    expect(created.body.data.description).toBeNull();
    await http()
      .post('/api/incident-types')
      .set('Authorization', auth('ADMIN'))
      .send({ code: 'MEDICAL', name: 'Duplicate' })
      .expect(409);
    await http()
      .patch(`/api/incident-types/${created.body.data.id}`)
      .set('Authorization', auth('ADMIN'))
      .send({ isActive: false })
      .expect(200);
    await http()
      .patch(`/api/incident-types/${created.body.data.id}`)
      .set('Authorization', auth('ADMIN'))
      .send({ isActive: null })
      .expect(400);
    await http()
      .post('/api/incident-types')
      .set('Authorization', auth('REPORTER'))
      .send({ code: 'X', name: 'X' })
      .expect(403);
    const list = await http()
      .get('/api/incident-types?limit=1&page=2')
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(list.body.data).toMatchObject({ page: 2, limit: 1, total: 2 });
    await http()
      .get('/api/incident-types?includeInactive=true')
      .set('Authorization', auth('REPORTER'))
      .expect(403);
    const all = await http()
      .get('/api/incident-types?includeInactive=true')
      .set('Authorization', auth('ADMIN'))
      .expect(200);
    expect(all.body.data.total).toBe(3);
    await http()
      .post('/api/incidents')
      .set('Authorization', auth('REPORTER'))
      .send({ ...incidentBody(), incidentTypeId: created.body.data.id })
      .expect(404);
  });

  it('creates pending incidents, audit logs and management notifications atomically', async () => {
    incidentId = await createIncident();
    await http()
      .post(`/api/incidents/${incidentId}/assignments`)
      .set('Authorization', auth('OPERATOR'))
      .send({ securityUserId: ids.SECURITY })
      .expect(409);
    const incident = await db
      .getRepository(entities.Incident)
      .findOneByOrFail({ id: incidentId });
    expect(incident).toMatchObject({
      reporterId: ids.REPORTER,
      status: 'PENDING',
      latitude: '10.7000000',
      verifiedBy: null,
    });
    expect(
      await db
        .getRepository(entities.IncidentLog)
        .countBy({ incidentId, action: 'CREATED' }),
    ).toBe(1);
    expect(
      await db
        .getRepository(entities.Notification)
        .countBy({ incidentId, type: 'INCIDENT_CREATED' }),
    ).toBe(2);
    await http()
      .post('/api/incidents')
      .set('Authorization', auth('REPORTER'))
      .send({ ...incidentBody(), incidentTypeId: otherId, description: ' ' })
      .expect(400);
  });

  it('enforces incident visibility and combines filters without bypassing ownership', async () => {
    await http()
      .get(`/api/incidents/${incidentId}`)
      .set('Authorization', auth('OUTSIDER'))
      .expect(403);
    await http()
      .get(`/api/incidents/${incidentId}`)
      .set('Authorization', auth('SECURITY'))
      .expect(403);
    const visible = await http()
      .get(
        '/api/incidents?status=PENDING&severity=HIGH&search=building&limit=1',
      )
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    expect(
      visible.body.data.items.map((item: { id: string }) => item.id),
    ).toContain(incidentId);
    const hidden = await http()
      .get(`/api/incidents?reporterId=${ids.REPORTER}`)
      .set('Authorization', auth('OUTSIDER'))
      .expect(200);
    expect(hidden.body.data.total).toBe(0);
    await http()
      .get('/api/incidents?page=0')
      .set('Authorization', auth('REPORTER'))
      .expect(400);
    await http()
      .get('/api/incidents?limit=101')
      .set('Authorization', auth('REPORTER'))
      .expect(400);
    await http()
      .get('/api/incidents?from=2027-01-01&to=2026-01-01')
      .set('Authorization', auth('REPORTER'))
      .expect(400);
    const detail = await http()
      .get(`/api/incidents/${incidentId}`)
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    expect(JSON.stringify(detail.body.data)).not.toContain('passwordHash');
  });

  it('allows pending edits only by the reporter or management and records the changes', async () => {
    await http()
      .patch(`/api/incidents/${incidentId}`)
      .set('Authorization', auth('OUTSIDER'))
      .send({ title: 'Hijack' })
      .expect(403);
    await http()
      .patch(`/api/incidents/${incidentId}`)
      .set('Authorization', auth('REPORTER'))
      .send({ title: null })
      .expect(400);
    await http()
      .patch(`/api/incidents/${incidentId}`)
      .set('Authorization', auth('REPORTER'))
      .send({})
      .expect(400);
    await http()
      .patch(`/api/incidents/${incidentId}`)
      .set('Authorization', auth('REPORTER'))
      .send({ status: 'RESOLVED' })
      .expect(400);
    await http()
      .patch(`/api/incidents/${incidentId}`)
      .set('Authorization', auth('REPORTER'))
      .send({ address: 'Building B' })
      .expect(200);
    const log = await db
      .getRepository(entities.IncidentLog)
      .findOneByOrFail({ incidentId, action: 'UPDATED' });
    expect(log.metadata).toMatchObject({
      address: { old: 'Building A', new: 'Building B' },
    });
  });

  it('uploads, downloads and deletes evidence through authorized APIs', async () => {
    const uploaded = await http()
      .post(`/api/incidents/${incidentId}/attachments`)
      .set('Authorization', auth('REPORTER'))
      .attach('file', png, {
        filename: 'evidence.png',
        contentType: 'image/png',
      })
      .expect(201);
    expect(uploaded.body.data.fileUrl).toBe(
      `/api/attachments/${uploaded.body.data.id}/content`,
    );
    const files = await http()
      .get(`/api/incidents/${incidentId}/attachments`)
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    expect(files.body.data.total).toBe(1);
    await http()
      .get(uploaded.body.data.fileUrl)
      .set('Authorization', auth('OUTSIDER'))
      .expect(403);
    const content = await http()
      .get(uploaded.body.data.fileUrl)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(content.headers['content-type']).toContain('image/png');
    expect(content.body).toEqual(png);
    await http()
      .delete(`/api/attachments/${uploaded.body.data.id}`)
      .set('Authorization', auth('OUTSIDER'))
      .expect(403);
    await http()
      .delete(`/api/attachments/${uploaded.body.data.id}`)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    await http()
      .get(uploaded.body.data.fileUrl)
      .set('Authorization', auth('REPORTER'))
      .expect(404);
    expect(await readdir(uploadDir)).toEqual([]);
    await http()
      .post(`/api/incidents/${incidentId}/attachments`)
      .set('Authorization', auth('REPORTER'))
      .attach('file', Buffer.from('not an image'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
    await http()
      .post(`/api/incidents/${incidentId}/attachments`)
      .set('Authorization', auth('REPORTER'))
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: 'huge.png',
        contentType: 'image/png',
      })
      .expect(413);
    await http()
      .post(`/api/incidents/${incidentId}/attachments`)
      .set('Authorization', auth('OUTSIDER'))
      .attach('file', png, { filename: 'x.png', contentType: 'image/png' })
      .expect(403);
    expect(await readdir(uploadDir)).toEqual([]);
  });

  it('serializes concurrent verification and rejection, storing reviewer, reason and logs', async () => {
    await http()
      .patch(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', auth('REPORTER'))
      .send({})
      .expect(403);
    await http()
      .patch(`/api/incidents/${incidentId}/reject`)
      .set('Authorization', auth('OPERATOR'))
      .send({ reason: ' ' })
      .expect(400);
    await http()
      .patch(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', auth('OPERATOR'))
      .send({})
      .expect(200);
    await http()
      .patch(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', auth('ADMIN'))
      .send({})
      .expect(409);
    await http()
      .patch(`/api/incidents/${incidentId}`)
      .set('Authorization', auth('REPORTER'))
      .send({ title: 'Too late' })
      .expect(409);
    const reviewed = await db
      .getRepository(entities.Incident)
      .findOneByOrFail({ id: incidentId });
    expect(reviewed.verifiedBy).toBe(ids.OPERATOR);
    expect(reviewed.verifiedAt).toBeInstanceOf(Date);
    const rejectedId = await createIncident('Invalid report');
    await http()
      .patch(`/api/incidents/${rejectedId}/reject`)
      .set('Authorization', auth('ADMIN'))
      .send({ reason: 'Duplicate location' })
      .expect(200);
    expect(
      await db
        .getRepository(entities.Incident)
        .findOneByOrFail({ id: rejectedId }),
    ).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Duplicate location',
      verifiedBy: ids.ADMIN,
    });
    const raceId = await createIncident('Review race');
    const results = await Promise.all([
      http()
        .patch(`/api/incidents/${raceId}/verify`)
        .set('Authorization', auth('OPERATOR'))
        .send({}),
      http()
        .patch(`/api/incidents/${raceId}/reject`)
        .set('Authorization', auth('ADMIN'))
        .send({ reason: 'Not valid' }),
    ]);
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([200, 409]);
    expect(
      await db
        .getRepository(entities.IncidentLog)
        .countBy({ incidentId: raceId }),
    ).toBe(2);
  });

  it('assigns one active security officer and prevents duplicate concurrent assignments', async () => {
    await http()
      .post(`/api/incidents/${incidentId}/assignments`)
      .set('Authorization', auth('REPORTER'))
      .send({ securityUserId: ids.SECURITY })
      .expect(403);
    await http()
      .post(`/api/incidents/${incidentId}/assignments`)
      .set('Authorization', auth('OPERATOR'))
      .send({ securityUserId: ids.REPORTER })
      .expect(409);
    const results = await Promise.all([
      http()
        .post(`/api/incidents/${incidentId}/assignments`)
        .set('Authorization', auth('OPERATOR'))
        .send({ securityUserId: ids.SECURITY }),
      http()
        .post(`/api/incidents/${incidentId}/assignments`)
        .set('Authorization', auth('ADMIN'))
        .send({ securityUserId: ids.SECURITY }),
    ]);
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    assignmentId = results.find((result) => result.status === 201)!.body.data
      .id;
    expect(
      await db.getRepository(entities.Assignment).countBy({ incidentId }),
    ).toBe(1);
    await http()
      .get(`/api/incidents/${incidentId}`)
      .set('Authorization', auth('SECURITY'))
      .expect(200);
    const visible = await http()
      .get('/api/incidents')
      .set('Authorization', auth('SECURITY'))
      .expect(200);
    expect(
      visible.body.data.items.map((item: { id: string }) => item.id),
    ).toContain(incidentId);
    const history = await http()
      .get(`/api/incidents/${incidentId}/assignments`)
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    expect(history.body.data.items[0].id).toBe(assignmentId);
    const mine = await http()
      .get('/api/assignments/me?status=ASSIGNED')
      .set('Authorization', auth('SECURITY'))
      .expect(200);
    expect(mine.body.data.items[0].id).toBe(assignmentId);
    const securityList = await http()
      .get('/api/assignments/security-users')
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    expect(securityList.body.data.total).toBe(2);
    expect(JSON.stringify(securityList.body.data)).not.toContain(
      'passwordHash',
    );
  });

  it('enforces ownership and workflow order, synchronizing completion and timestamps', async () => {
    await http()
      .patch(`/api/assignments/${assignmentId}/accept`)
      .set('Authorization', auth('SECURITY2'))
      .send({})
      .expect(403);
    await http()
      .patch(`/api/assignments/${assignmentId}/complete`)
      .set('Authorization', auth('SECURITY'))
      .send({})
      .expect(409);
    await http()
      .patch(`/api/users/${ids.SECURITY}/role`)
      .set('Authorization', auth('ADMIN'))
      .send({
        roleId: (
          await db
            .getRepository(entities.Role)
            .findOneByOrFail({ code: 'OPERATOR' })
        ).id,
      })
      .expect(409);
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
    const completed = await http()
      .patch(`/api/assignments/${assignmentId}/complete`)
      .set('Authorization', auth('SECURITY'))
      .send({ note: 'Fire extinguished' })
      .expect(200);
    expect(completed.body.data.incident.status).toBe('RESOLVED');
    expect(completed.body.data.assignment).toMatchObject({
      status: 'COMPLETED',
    });
    expect(completed.body.data.incident.resolvedAt).toBeTruthy();
    expect(completed.body.data.assignment.acceptedAt).toBeTruthy();
    expect(completed.body.data.assignment.startedAt).toBeTruthy();
    expect(completed.body.data.assignment.completedAt).toBeTruthy();
    await http()
      .patch(`/api/assignments/${assignmentId}/complete`)
      .set('Authorization', auth('SECURITY'))
      .send({})
      .expect(409);
    const logs = await http()
      .get(`/api/incidents/${incidentId}/logs?limit=100`)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(
      logs.body.data.items.map((item: { action: string }) => item.action),
    ).toEqual(
      expect.arrayContaining([
        'CREATED',
        'UPDATED',
        'VERIFIED',
        'ASSIGNED',
        'ACCEPTED',
        'STARTED',
        'RESOLVED',
        'ATTACHMENT_UPLOADED',
        'ATTACHMENT_DELETED',
      ]),
    );
  });

  it('cancels assignments and allows reassignment while revoking the former officer access', async () => {
    const id = await createIncident('Reassignment');
    await http()
      .patch(`/api/incidents/${id}/verify`)
      .set('Authorization', auth('OPERATOR'))
      .send({})
      .expect(200);
    const assignment = await http()
      .post(`/api/incidents/${id}/assignments`)
      .set('Authorization', auth('OPERATOR'))
      .send({ securityUserId: ids.SECURITY })
      .expect(201);
    await http()
      .patch(`/api/assignments/${assignment.body.data.id}/cancel`)
      .set('Authorization', auth('OPERATOR'))
      .send({ note: 'Change shift' })
      .expect(200);
    await http()
      .get(`/api/incidents/${id}`)
      .set('Authorization', auth('SECURITY'))
      .expect(403);
    const history = await http()
      .get('/api/assignments/me?status=CANCELLED')
      .set('Authorization', auth('SECURITY'))
      .expect(200);
    const cancelled = history.body.data.items.find(
      (item: { id: string }) => item.id === assignment.body.data.id,
    );
    expect(cancelled).toBeDefined();
    expect(cancelled).not.toHaveProperty('incident');
    await http()
      .post(`/api/incidents/${id}/assignments`)
      .set('Authorization', auth('OPERATOR'))
      .send({ securityUserId: ids.SECURITY2 })
      .expect(201);
  });

  it('attaches owned uploaded images atomically and checks incident access', async () => {
    const upload = await http()
      .post('/api/uploads')
      .set('Authorization', auth('REPORTER'))
      .attach('files', png, { filename: 'photo.png', contentType: 'image/png' })
      .expect(201);
    const file = upload.body.data.files[0];
    await http()
      .post('/api/incidents')
      .set('Authorization', auth('OUTSIDER'))
      .send({ ...incidentBody(), attachmentIds: [file.id] })
      .expect(404);
    const created = await http()
      .post('/api/incidents')
      .set('Authorization', auth('REPORTER'))
      .send({
        ...incidentBody('Incident with image'),
        attachmentIds: [file.id],
      })
      .expect(201);
    const id = created.body.data.incident.id;
    const attachments = await http()
      .get(`/api/incidents/${id}/attachments`)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(attachments.body.data.items).toHaveLength(1);
    const content = await http()
      .get(attachments.body.data.items[0].fileUrl)
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    expect(content.body).toEqual(png);
    await http()
      .get(file.url)
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    await http()
      .get(file.url)
      .set('Authorization', auth('OUTSIDER'))
      .expect(404);
    const before = await db.getRepository(entities.Incident).count();
    await http()
      .post('/api/incidents')
      .set('Authorization', auth('REPORTER'))
      .send({ ...incidentBody(), attachmentIds: [file.id] })
      .expect(400);
    expect(await db.getRepository(entities.Incident).count()).toBe(before);
    await http()
      .patch(`/api/incidents/${id}`)
      .set('Authorization', auth('REPORTER'))
      .send({ attachmentIds: [] })
      .expect(400);
    await http()
      .delete(`/api/attachments/${attachments.body.data.items[0].id}`)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(
      await db.getRepository(entities.UploadedFile).findOneBy({ id: file.id }),
    ).toBeNull();
    await http()
      .post('/api/incidents')
      .set('Authorization', auth('REPORTER'))
      .send({ ...incidentBody(), attachmentIds: [file.id] })
      .expect(404);
  });

  it('rejects integers outside PostgreSQL int4 range before querying the database', async () => {
    await http()
      .post('/api/incidents')
      .set('Authorization', auth('REPORTER'))
      .send({ ...incidentBody(), incidentTypeId: 2147483648 })
      .expect(400);
    await http()
      .get('/api/incidents?incidentTypeId=2147483648')
      .set('Authorization', auth('REPORTER'))
      .expect(400);
    await http()
      .patch(`/api/users/${ids.SECURITY}/role`)
      .set('Authorization', auth('ADMIN'))
      .send({ roleId: 2147483648 })
      .expect(400);
    await http()
      .patch('/api/incident-types/2147483648')
      .set('Authorization', auth('ADMIN'))
      .send({ name: 'Oversized ID' })
      .expect(400);
  });

  it('allows only one concurrent claim of the same uploaded image', async () => {
    const upload = await http()
      .post('/api/uploads')
      .set('Authorization', auth('REPORTER'))
      .attach('files', png, { filename: 'claim.png', contentType: 'image/png' })
      .expect(201);
    const file = upload.body.data.files[0];
    const count = await db.getRepository(entities.Incident).count();
    const results = await Promise.all(
      [1, 2].map((n) =>
        http()
          .post('/api/incidents')
          .set('Authorization', auth('REPORTER'))
          .send({
            ...incidentBody(`Concurrent image ${n}`),
            attachmentIds: [file.id],
          }),
      ),
    );
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 400,
    ]);
    expect(await db.getRepository(entities.Incident).count()).toBe(count + 1);
    expect(
      await db
        .getRepository(entities.IncidentAttachment)
        .countBy({ fileUrl: file.filename }),
    ).toBe(1);
  });

  it('prevents role changes and deactivation while a Security user has active work', async () => {
    const pending = await createIncident('Active work prevents access changes');
    await http()
      .patch(`/api/incidents/${pending}/verify`)
      .set('Authorization', auth('OPERATOR'))
      .send({})
      .expect(200);
    await http()
      .post(`/api/incidents/${pending}/assignments`)
      .set('Authorization', auth('OPERATOR'))
      .send({ securityUserId: ids.SECURITY2 })
      .expect(201);
    const operatorRole = await db
      .getRepository(entities.Role)
      .findOneByOrFail({ code: 'OPERATOR' });
    await http()
      .patch(`/api/users/${ids.SECURITY2}/role`)
      .set('Authorization', auth('ADMIN'))
      .send({ roleId: operatorRole.id })
      .expect(409);
    await http()
      .patch(`/api/users/${ids.SECURITY2}/status`)
      .set('Authorization', auth('ADMIN'))
      .send({ isActive: false })
      .expect(409);
    const sessions = await http()
      .get('/api/assignments/me')
      .set('Authorization', auth('SECURITY2'))
      .expect(200);
    expect(sessions.body.data.items.length).toBeGreaterThan(0);
  });

  it('closes only resolved incidents and logs/notifies the final state', async () => {
    await http()
      .patch(`/api/incidents/${incidentId}/close`)
      .set('Authorization', auth('REPORTER'))
      .send({ note: 'Closed' })
      .expect(403);
    const closed = await http()
      .patch(`/api/incidents/${incidentId}/close`)
      .set('Authorization', auth('OPERATOR'))
      .send({ note: 'Verified resolution' })
      .expect(200);
    expect(closed.body.data.status).toBe('CLOSED');
    expect(closed.body.data.resolvedAt).toBeTruthy();
    await http()
      .patch(`/api/incidents/${incidentId}/close`)
      .set('Authorization', auth('OPERATOR'))
      .send({})
      .expect(409);
    const pending = await createIncident('Cannot close pending');
    await http()
      .patch(`/api/incidents/${pending}/close`)
      .set('Authorization', auth('ADMIN'))
      .send({})
      .expect(409);
    const logs = await http()
      .get(`/api/incidents/${incidentId}/logs?limit=100`)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(logs.body.data.items.at(-1)).toMatchObject({
      action: 'CLOSED',
      oldStatus: 'RESOLVED',
      newStatus: 'CLOSED',
    });
    const summary = await http()
      .get('/api/dashboard/summary')
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    expect(summary.body.data.byStatus.CLOSED).toBeGreaterThan(0);
  });

  it('rotates refresh tokens once, revokes the whole session on logout, and audits staff creation', async () => {
    const login = await http()
      .post('/api/auth/login')
      .send({ email: 'reporter@example.com', password })
      .expect(200);
    const cookie = (
      login.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
    const results = await Promise.all([
      http().post('/api/auth/refresh').set('Cookie', cookie),
      http().post('/api/auth/refresh').set('Cookie', cookie),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 401,
    ]);
    const refreshed = results.find((r) => r.status === 200)!;
    await http()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${refreshed.body.data.accessToken}`)
      .expect(200);
    await http()
      .get('/api/users/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(401);
    const nextCookie = (
      refreshed.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
    await http()
      .post('/api/auth/refresh')
      .set('Cookie', nextCookie)
      .expect(401);
    const audit = await http()
      .get(`/api/users/${ids.SECURITY}/audit-logs`)
      .set('Authorization', auth('ADMIN'))
      .expect(200);
    expect(audit.body.data.logs[0]).toMatchObject({
      action: 'USER_CREATED',
      actorId: ids.ADMIN,
    });
    expect(JSON.stringify(audit.body)).not.toMatch(
      /passwordHash|refreshTokenHash/,
    );
  });

  it('revokes sessions on role changes and prevents changes to ADMIN accounts', async () => {
    await http()
      .patch(`/api/users/${ids.OUTSIDER}/role`)
      .set('Authorization', auth('ADMIN'))
      .send({
        roleId: (
          await db
            .getRepository(entities.Role)
            .findOneByOrFail({ code: 'OPERATOR' })
        ).id,
      })
      .expect(200);
    // Role changes revoke existing sessions.
    await http()
      .get('/api/assignments/security-users')
      .set('Authorization', auth('OUTSIDER'))
      .expect(401);
    await http()
      .patch(`/api/users/${ids.ADMIN}/role`)
      .set('Authorization', auth('ADMIN'))
      .send({
        roleId: (
          await db
            .getRepository(entities.Role)
            .findOneByOrFail({ code: 'OPERATOR' })
        ).id,
      })
      .expect(409);
  });

  it('scopes notifications to the recipient and preserves read timestamps', async () => {
    const list = await http()
      .get('/api/notifications?isRead=false&limit=100')
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(list.body.data.unreadCount).toBeGreaterThan(0);
    expect(
      list.body.data.items.some(
        (item: { type: string }) => item.type === 'INCIDENT_RESOLVED',
      ),
    ).toBe(true);
    const notificationId = list.body.data.items[0].id;
    await http()
      .patch(`/api/notifications/${notificationId}/read`)
      .set('Authorization', auth('SECURITY2'))
      .expect(404);
    const first = await http()
      .patch(`/api/notifications/${notificationId}/read`)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    const second = await http()
      .patch(`/api/notifications/${notificationId}/read`)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(first.body.data.readAt).toBe(second.body.data.readAt);
    await http()
      .patch('/api/notifications/read-all')
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    const unread = await http()
      .get('/api/notifications?isRead=false')
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(unread.body.data).toMatchObject({ total: 0, unreadCount: 0 });
  });

  it('rejects null or whitespace names and preserves nullable profile fields', async () => {
    await http()
      .patch('/api/users/me')
      .set('Authorization', auth('REPORTER'))
      .send({ fullName: null })
      .expect(400);
    await http()
      .patch('/api/users/me')
      .set('Authorization', auth('REPORTER'))
      .send({ fullName: '   ' })
      .expect(400);
    await http()
      .post('/api/auth/register')
      .send({ fullName: '   ', email: 'blank@example.com', password })
      .expect(400);
    await http()
      .patch('/api/users/me')
      .set('Authorization', auth('REPORTER'))
      .send({ phone: null, avatarUrl: null })
      .expect(200);
    await http()
      .patch('/api/users/me')
      .set('Authorization', auth('REPORTER'))
      .send({ email: null })
      .expect(400);
    await http()
      .patch('/api/users/me')
      .set('Authorization', auth('REPORTER'))
      .send({})
      .expect(400);
    await Promise.all([
      http()
        .patch('/api/users/me')
        .set('Authorization', auth('REPORTER'))
        .send({ fullName: 'Concurrent Profile' })
        .expect(200),
      http()
        .patch('/api/users/me')
        .set('Authorization', auth('REPORTER'))
        .send({ phone: '0901234567' })
        .expect(200),
    ]);
    const profile = await http()
      .get('/api/users/me')
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(profile.body.data).toMatchObject({
      fullName: 'Concurrent Profile',
      phone: '0901234567',
    });
  });

  it('preserves disabled catalog entries when seeds are rerun', async () => {
    const repo = db.getRepository(entities.IncidentType);
    await repo.update(fireId, { isActive: false, name: 'Custom fire name' });
    const url = new URL(testUrl);
    try {
      await promisify(execFile)(
        process.execPath,
        ['dist/database/seeds/seed-incident-types.js'],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DB_HOST: url.hostname,
            DB_PORT: url.port || '5432',
            DB_USERNAME: decodeURIComponent(url.username),
            DB_PASSWORD: decodeURIComponent(url.password),
            DB_DATABASE: decodeURIComponent(url.pathname.slice(1)),
            PGOPTIONS: `-c search_path=${schema},public`,
          },
        },
      );
      expect(await repo.findOneByOrFail({ id: fireId })).toMatchObject({
        isActive: false,
        name: 'Custom fire name',
      });
    } finally {
      await repo.update(fireId, { isActive: true });
    }
  });

  it('returns conflict for concurrent registration of the same email', async () => {
    const body = {
      fullName: 'Concurrent reporter',
      email: 'concurrent@example.com',
      password,
    };
    const results = await Promise.all([
      http().post('/api/auth/register').send(body),
      http().post('/api/auth/register').send(body),
    ]);
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
  });

  it('gives each login a unique session and accepts case insensitive bearer scheme', async () => {
    const login = await http()
      .post('/api/auth/login')
      .send({ email: 'reporter@example.com', password })
      .expect(200);
    const payload = JSON.parse(
      Buffer.from(
        login.body.data.accessToken.split('.')[1],
        'base64url',
      ).toString(),
    );
    expect(payload.jti).toEqual(expect.any(String));
    await http()
      .get('/api/users/me')
      .set('Authorization', `bearer ${login.body.data.accessToken}`)
      .expect(200);
    await http()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);
    await http()
      .get('/api/users/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(401);
    await http()
      .get('/api/users/me')
      .set('Authorization', auth('REPORTER'))
      .expect(200);
  });

  it('invalidates existing sessions after password changes', async () => {
    const email = 'password-change@example.com';
    await http()
      .post('/api/auth/register')
      .send({ fullName: 'Password change', email, password })
      .expect(201);
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const changedPassword = 'ChangedPassword123!';
    await http()
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({
        currentPassword: password,
        newPassword: changedPassword,
        confirmPassword: changedPassword,
      })
      .expect(200);
    await http()
      .get('/api/users/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(401);
    await http().post('/api/auth/login').send({ email, password }).expect(401);
    await http()
      .post('/api/auth/login')
      .send({ email, password: changedPassword })
      .expect(200);
  });

  it('rolls back incident, log and uploaded file if recording the transaction fails', async () => {
    const existingFiles = (await readdir(uploadDir)).sort();
    const count = await db.getRepository(entities.Incident).count();
    await db.query(
      `CREATE FUNCTION "${schema}".fail_notification() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'intentional test failure'; END; $$ LANGUAGE plpgsql`,
    );
    await db.query(
      `CREATE TRIGGER fail_notification BEFORE INSERT ON "${schema}".notifications FOR EACH ROW EXECUTE FUNCTION "${schema}".fail_notification()`,
    );
    try {
      await http()
        .post('/api/incidents')
        .set('Authorization', auth('REPORTER'))
        .send(incidentBody('Must rollback'))
        .expect(500);
    } finally {
      await db.query(
        `DROP TRIGGER fail_notification ON "${schema}".notifications`,
      );
    }
    expect(await db.getRepository(entities.Incident).count()).toBe(count);
    const pendingId = await createIncident('Upload rollback');
    await db.query(
      `CREATE TRIGGER fail_attachment_log BEFORE INSERT ON "${schema}".incident_logs FOR EACH ROW EXECUTE FUNCTION "${schema}".fail_notification()`,
    );
    try {
      await http()
        .post(`/api/incidents/${pendingId}/attachments`)
        .set('Authorization', auth('REPORTER'))
        .attach('file', png, {
          filename: 'rollback.png',
          contentType: 'image/png',
        })
        .expect(500);
    } finally {
      await db.query(
        `DROP TRIGGER fail_attachment_log ON "${schema}".incident_logs`,
      );
    }
    expect(
      await db
        .getRepository(entities.IncidentAttachment)
        .countBy({ incidentId: pendingId }),
    ).toBe(0);
    expect((await readdir(uploadDir)).sort()).toEqual(existingFiles);
    const uploaded = await http()
      .post(`/api/incidents/${pendingId}/attachments`)
      .set('Authorization', auth('REPORTER'))
      .attach('file', png, {
        filename: 'restore.png',
        contentType: 'image/png',
      })
      .expect(201);
    await db.query(
      `CREATE TRIGGER fail_delete_log BEFORE INSERT ON "${schema}".incident_logs FOR EACH ROW EXECUTE FUNCTION "${schema}".fail_notification()`,
    );
    try {
      await http()
        .delete(`/api/attachments/${uploaded.body.data.id}`)
        .set('Authorization', auth('REPORTER'))
        .expect(500);
    } finally {
      await db.query(
        `DROP TRIGGER fail_delete_log ON "${schema}".incident_logs`,
      );
    }
    await http()
      .get(uploaded.body.data.fileUrl)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(
      await db
        .getRepository(entities.IncidentAttachment)
        .countBy({ incidentId: pendingId }),
    ).toBe(1);
    await http()
      .delete(`/api/attachments/${uploaded.body.data.id}`)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect((await readdir(uploadDir)).sort()).toEqual(existingFiles);
  });
  it('refuses to seed an administrator over an existing Reporter account', async () => {
    const email = 'seed-collision@example.com';
    const registered = await http()
      .post('/api/auth/register')
      .send({ fullName: 'Existing Reporter', email, password })
      .expect(201);
    const url = new URL(testUrl);
    await expect(
      promisify(execFile)(
        process.execPath,
        ['dist/database/seeds/seed-admin.js'],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DB_HOST: url.hostname,
            DB_PORT: url.port || '5432',
            DB_USERNAME: decodeURIComponent(url.username),
            DB_PASSWORD: decodeURIComponent(url.password),
            DB_DATABASE: decodeURIComponent(url.pathname.slice(1)),
            PGOPTIONS: `-c search_path=${schema},public`,
            ADMIN_EMAIL: email,
            ADMIN_PASSWORD: 'SeedAdminPassword123!',
          },
        },
      ),
    ).rejects.toHaveProperty('code', 1);
    const reporter = await db.getRepository(entities.User).findOneOrFail({
      where: { id: registered.body.data.user.id },
      relations: { role: true },
    });
    expect(reporter.role.code).toBe('REPORTER');
  });

  it('restores upload metadata and image bytes when attached-image deletion rolls back', async () => {
    const upload = await http()
      .post('/api/uploads')
      .set('Authorization', auth('REPORTER'))
      .attach('files', png, {
        filename: 'rollback.png',
        contentType: 'image/png',
      })
      .expect(201);
    const file = upload.body.data.files[0];
    const created = await http()
      .post('/api/incidents')
      .set('Authorization', auth('REPORTER'))
      .send({ ...incidentBody('Image rollback'), attachmentIds: [file.id] })
      .expect(201);
    const id = created.body.data.incident.id;
    const attachment = await db
      .getRepository(entities.IncidentAttachment)
      .findOneByOrFail({ incidentId: id });
    await db.query(
      `CREATE TRIGGER fail_image_delete_log BEFORE INSERT ON "${schema}".incident_logs FOR EACH ROW EXECUTE FUNCTION "${schema}".fail_notification()`,
    );
    try {
      await http()
        .delete(`/api/attachments/${attachment.id}`)
        .set('Authorization', auth('REPORTER'))
        .expect(500);
    } finally {
      await db.query(
        `DROP TRIGGER fail_image_delete_log ON "${schema}".incident_logs`,
      );
    }
    expect(
      await db.getRepository(entities.UploadedFile).findOneBy({ id: file.id }),
    ).not.toBeNull();
    const content = await http()
      .get(`/api/attachments/${attachment.id}/content`)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(content.body).toEqual(png);
    await http()
      .get(file.url)
      .set('Authorization', auth('OPERATOR'))
      .expect(200);
    await http()
      .delete(`/api/attachments/${attachment.id}`)
      .set('Authorization', auth('REPORTER'))
      .expect(200);
    expect(
      await db.getRepository(entities.UploadedFile).findOneBy({ id: file.id }),
    ).toBeNull();
  });
});
