import { UnauthorizedException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service.js';
import {
  SessionService,
  type AccessPayload,
} from '../src/auth/session.service.js';
import { UsersService } from '../src/users/users.service.js';
import { createTestApplication } from './create-test-app.js';
import { actor, otherId, sessionId, userId } from './fixtures.js';
import { presentUser } from '../src/users/user.presenter.js';
import { makeUser } from './fixtures.js';
import type { RoleCode } from '../src/auth/roles.js';
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, Repository } from 'typeorm';
import { UploadsService } from '../src/uploads/uploads.service.js';
import { UploadedFile } from '../src/database/entities/uploaded-file.entity.js';
import { config, png } from './fixtures.js';

describe('HTTP security contracts (real Nest pipeline, mocked persistence/services)', () => {
  let app: NestExpressApplication;
  let jwt: JwtService;
  let active: boolean;
  let currentRole: RoleCode;
  let auth: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let uploadDirectory: string;
  beforeAll(async () => {
    uploadDirectory = await mkdtemp(join(tmpdir(), 'safeops-http-'));
  });
  afterAll(async () => {
    await rmdir(uploadDirectory);
  });
  const token = async (options = {}) =>
    jwt.signAsync(
      { sub: userId, sid: sessionId, role: currentRole, type: 'access' },
      options,
    );
  beforeEach(async () => {
    active = true;
    currentRole = 'REPORTER';
    const safeUser = presentUser(makeUser());
    auth = {
      register: jest
        .fn()
        .mockResolvedValue({ message: 'registered', user: safeUser }),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(async () => {
        active = false;
        return { message: 'logged out' };
      }),
    };
    users = {
      findAll: jest.fn().mockResolvedValue({
        users: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }),
      findOne: jest.fn().mockResolvedValue(safeUser),
      update: jest.fn().mockResolvedValue(safeUser),
      changePassword: jest.fn().mockResolvedValue({ message: 'changed' }),
      create: jest.fn().mockResolvedValue({ user: safeUser }),
      updateRole: jest.fn(),
      updateStatus: jest.fn(),
      auditLogs: jest.fn(),
    };
    const sessions = {
      validatePayload: jest.fn(async (payload: AccessPayload) => {
        if (!active || payload.sid !== sessionId)
          throw new UnauthorizedException();
        return { ...actor, role: currentRole };
      }),
    };
    const uploadRecords: UploadedFile[] = [];
    const uploadRepository = {
      create: (data: Partial<UploadedFile>) =>
        Object.assign(new UploadedFile(), data),
      save: async (files: UploadedFile[]) => {
        uploadRecords.push(...files);
        return files;
      },
      findOneBy: async ({ filename }: { filename: string }) =>
        uploadRecords.find((file) => file.filename === filename) ?? null,
    };
    const uploads = new UploadsService(
      uploadRepository as unknown as Repository<UploadedFile>,
      config({ UPLOAD_DIR: uploadDirectory }),
      {} as DataSource,
    );
    const result = await createTestApplication([
      { token: UploadsService, value: uploads },
      { token: AuthService, value: auth },
      { token: SessionService, value: sessions },
      { token: UsersService, value: users },
    ]);
    app = result.app;
    jwt = result.module.get(JwtService);
    auth.login.mockImplementation(async () => ({
      accessToken: await token(),
      tokenType: 'Bearer',
      expiresIn: 900,
      user: safeUser,
      refreshToken: 'opaque-refresh',
      refreshExpiresAt: new Date(Date.now() + 86400000),
    }));
    auth.refresh.mockImplementation(async (cookie) => {
      if (cookie !== 'opaque-refresh') throw new UnauthorizedException();
      return {
        accessToken: await token(),
        tokenType: 'Bearer',
        expiresIn: 900,
        user: safeUser,
        refreshToken: 'rotated-refresh',
        refreshExpiresAt: new Date(Date.now() + 86400000),
      };
    });
  });
  afterEach(async () => {
    await app.close();
    for (const filename of await readdir(uploadDirectory))
      await unlink(join(uploadDirectory, filename));
  });
  it('prefixes APIs and wraps JSON consistently', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ success: true, data: { status: 'ok' } });
    await request(app.getHttpServer()).get('/health').expect(404);
    const response = await request(app.getHttpServer())
      .get('/api/users')
      .expect(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });
  it.each(['ADMIN', 'OPERATOR', 'SECURITY', 'REPORTER'] as const)(
    'applies the user-list role matrix for %s',
    async (role) => {
      currentRole = role;
      await request(app.getHttpServer())
        .get('/api/users')
        .auth(await token(), { type: 'bearer' })
        .expect(['ADMIN', 'OPERATOR'].includes(role) ? 200 : 403);
    },
  );
  it('parses false literally and validates pagination and filters', async () => {
    currentRole = 'OPERATOR';
    const access = await token();
    await request(app.getHttpServer())
      .get('/api/users?role=SECURITY&isActive=false&page=2&limit=5')
      .auth(access, { type: 'bearer' })
      .expect(200);
    expect(users.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'SECURITY',
        isActive: false,
        page: 2,
        limit: 5,
      }),
      expect.objectContaining({ role: 'OPERATOR' }),
    );
    for (const query of [
      'page=0',
      'limit=101',
      'isActive=0',
      'role=MANAGER',
      'unknown=true',
    ]) {
      await request(app.getHttpServer())
        .get(`/api/users?${query}`)
        .auth(access, { type: 'bearer' })
        .expect(400);
    }
  });
  it('uses only the current identity for profile updates and rejects privilege injection', async () => {
    const access = await token();
    await request(app.getHttpServer())
      .patch('/api/users/me')
      .auth(access, { type: 'bearer' })
      .send({ fullName: '  Updated Name  ' })
      .expect(200);
    expect(users.update).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ fullName: 'Updated Name' }),
    );
    for (const body of [
      { roleId: 1 },
      { isActive: true },
      { fullName: '   ' },
      { email: null },
      { fullName: null },
    ]) {
      await request(app.getHttpServer())
        .patch('/api/users/me')
        .auth(access, { type: 'bearer' })
        .send(body)
        .expect(400);
    }
    await request(app.getHttpServer())
      .patch(`/api/users/${otherId}`)
      .auth(access, { type: 'bearer' })
      .send({ fullName: 'Changed User' })
      .expect(403);
  });
  it('sets an HttpOnly refresh cookie, normalizes credentials and keeps refresh secrets out of JSON', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ' USER@EXAMPLE.COM ', password: 'Password123' })
      .expect(200);
    expect(auth.login).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
    );
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(login.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(login.headers['set-cookie'][0]).toContain('Path=/api/auth');
    expect(login.headers['cache-control']).toBe('no-store');
    expect(login.body.data).not.toHaveProperty('refreshToken');
    const refresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', 'safeops_refresh=opaque-refresh')
      .expect(200);
    expect(refresh.headers['set-cookie'][0]).toContain('rotated-refresh');
    expect(refresh.body.data).not.toHaveProperty('refreshToken');
    await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
  });
  it('rejects cross-origin cookie actions', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Origin', 'https://attacker.example')
      .set('Cookie', 'safeops_refresh=opaque-refresh')
      .expect(403);
    expect(auth.refresh).not.toHaveBeenCalled();
  });
  it('rejects expired and forged JWTs with Passport signature validation', async () => {
    await request(app.getHttpServer())
      .get('/api/users/me')
      .auth(await token({ expiresIn: -1 }), { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/users/me')
      .auth(await token({ secret: 'attacker-secret' }), { type: 'bearer' })
      .expect(401);
  });
  it('clears the cookie on logout and rejects later access', async () => {
    const access = await token();
    const response = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .auth(access, { type: 'bearer' })
      .expect(200);
    expect(auth.logout).toHaveBeenCalledWith(userId, sessionId);
    expect(response.headers['set-cookie'][0]).toMatch(
      /Expires=Thu, 01 Jan 1970/,
    );
    await request(app.getHttpServer())
      .get('/api/users/me')
      .auth(access, { type: 'bearer' })
      .expect(401);
  });
  it('rate-limits credential attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt++)
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'user@example.com', password: 'Password123' })
        .expect(200);
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Password123' })
      .expect(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });
  it('rejects anonymous upload and admin actions from Operator', async () => {
    await request(app.getHttpServer()).post('/api/uploads').expect(401);
    currentRole = 'OPERATOR';
    await request(app.getHttpServer())
      .post('/api/users')
      .auth(await token(), { type: 'bearer' })
      .send({})
      .expect(403);
  });
  it('uploads multipart content and streams the image only with authentication', async () => {
    const access = await token();
    const response = await request(app.getHttpServer())
      .post('/api/uploads')
      .auth(access, { type: 'bearer' })
      .attach('files', png, {
        filename: '../../payload.html',
        contentType: 'text/html',
      })
      .expect(201);
    const url = response.body.data.urls[0] as string;
    expect(url).toMatch(/^\/api\/uploads\/[0-9a-f-]{36}\.png$/);
    const download = await request(app.getHttpServer())
      .get(url)
      .auth(access, { type: 'bearer' })
      .expect(200)
      .expect('Content-Type', /image\/png/);
    expect(download.body).toEqual(png);
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['cache-control']).toContain('no-store');
    await request(app.getHttpServer()).get(url).expect(401);
  });
  it('rejects spoofed image bytes and excessive multipart size', async () => {
    const access = await token();
    await request(app.getHttpServer())
      .post('/api/uploads')
      .auth(access, { type: 'bearer' })
      .attach('files', Buffer.from('<script>alert(1)</script>'), {
        filename: 'photo.png',
        contentType: 'image/png',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/uploads')
      .auth(access, { type: 'bearer' })
      .attach('files', Buffer.alloc(5242881), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(413);
    expect(await readdir(uploadDirectory)).toEqual([]);
  });
  it('publishes OpenAPI with refresh cookies, bearer auth, multipart and query schemas', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(response.body.paths['/api/auth/refresh'].post.security).toEqual([
      { safeops_refresh: [] },
    ]);
    expect(
      response.body.paths['/api/uploads'].post.requestBody.content,
    ).toHaveProperty('multipart/form-data');
    expect(response.body.paths['/api/users'].get.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'isActive' })]),
    );
    expect(response.body.components.schemas).toHaveProperty('RegisterDto');
  });
});
