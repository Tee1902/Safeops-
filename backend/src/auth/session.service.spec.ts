import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { SessionService, type AccessPayload } from './session.service.js';
import { AuthSession, User } from '../database/entities/index.js';
import { config, makeUser, userId, sessionId } from '../../test/fixtures.js';

describe('SessionService', () => {
  const refresh = `${sessionId}.${'a'.repeat(43)}`;
  let user: User;
  let session: AuthSession;
  let userQuery: Record<string, jest.Mock>;
  let sessionQuery: Record<string, jest.Mock>;
  let manager: Record<string, jest.Mock>;
  let sessionRepo: Record<string, jest.Mock>;
  let userRepo: Record<string, jest.Mock>;
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let service: SessionService;
  const payload = (): AccessPayload => ({
    sub: userId,
    sid: sessionId,
    role: 'REPORTER',
    type: 'access',
    exp: Math.floor(Date.now() / 1000) + 900,
  });
  beforeEach(() => {
    user = makeUser();
    session = Object.assign(new AuthSession(), {
      id: sessionId,
      userId,
      refreshTokenHash: createHash('sha256').update(refresh).digest('hex'),
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    });
    const query = (value: unknown) => ({
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(value),
    });
    userQuery = query(user);
    sessionQuery = query(session);
    userRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(userQuery),
      findOneOrFail: jest.fn().mockResolvedValue(user),
      findOne: jest.fn().mockResolvedValue(user),
    };
    sessionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(sessionQuery),
      findOne: jest.fn().mockResolvedValue(session),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    manager = {
      getRepository: jest.fn((entity) =>
        entity === User ? userRepo : sessionRepo,
      ),
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (_entity, data) => data),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue(user),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
      getRepository: manager.getRepository,
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('access-token'),
      verifyAsync: jest.fn().mockResolvedValue(payload()),
    };
    service = new SessionService(
      dataSource as unknown as DataSource,
      jwt as unknown as JwtService,
      config(),
    );
  });
  it('stores only a hash of a random refresh token and signs access claims with the session', async () => {
    const result = await service.create(user);
    const saved = manager.save.mock.calls.find(
      ([entity]) => entity === AuthSession,
    )![1] as AuthSession;
    expect(saved.refreshTokenHash).toBe(
      createHash('sha256').update(result.refreshToken).digest('hex'),
    );
    expect(saved.refreshTokenHash).not.toContain(result.refreshToken);
    expect(result.expiresIn).toBe(900);
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: userId,
        sid: saved.id,
        role: 'REPORTER',
        type: 'access',
      }),
      expect.objectContaining({ jwtid: expect.any(String) }),
    );
    expect(userQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
  });
  it('prevents login using a password validated before a concurrent password change', async () => {
    userQuery.getOne.mockResolvedValue(makeUser({ passwordHash: 'new-hash' }));
    await expect(service.create(user)).rejects.toMatchObject({ status: 401 });
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('rotates refresh tokens under a row lock and rejects reuse', async () => {
    const result = await service.refresh(refresh);
    expect(result.refreshToken).not.toBe(refresh);
    expect(sessionQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
    await expect(service.refresh(refresh)).rejects.toMatchObject({
      status: 401,
    });
    await expect(service.refresh(result.refreshToken)).resolves.toHaveProperty(
      'accessToken',
    );
  });
  it.each([undefined, '', 'not-a-token', `${sessionId}.short`])(
    'rejects malformed cookie %s',
    async (value) => {
      await expect(service.refresh(value)).rejects.toMatchObject({
        status: 401,
      });
      expect(manager.save).not.toHaveBeenCalled();
    },
  );
  it.each(['missing', 'expired', 'revoked', 'wrong-secret', 'inactive'])(
    'rejects %s refresh session',
    async (state) => {
      if (state === 'missing') sessionQuery.getOne.mockResolvedValue(null);
      if (state === 'expired') session.expiresAt = new Date(Date.now() - 1);
      if (state === 'revoked') session.revokedAt = new Date();
      if (state === 'wrong-secret') session.refreshTokenHash = '0'.repeat(64);
      if (state === 'inactive')
        manager.findOne.mockResolvedValue(makeUser({ isActive: false }));
      await expect(service.refresh(refresh)).rejects.toMatchObject({
        status: 401,
      });
      expect(manager.save).not.toHaveBeenCalled();
    },
  );
  it('uses the current database role when validating a JWT', async () => {
    userRepo.findOne.mockResolvedValue(
      makeUser({ role: { code: 'SECURITY' } as User['role'] }),
    );
    await expect(service.validatePayload(payload())).resolves.toMatchObject({
      role: 'SECURITY',
      sessionId,
    });
  });
  it.each([
    'missing-session',
    'inactive-user',
    'missing-user',
    'unknown-role',
    'expired',
    'wrong-type',
    'bad-sub',
  ])('rejects %s access', async (state) => {
    const claims = payload();
    if (state === 'missing-session')
      sessionRepo.findOne.mockResolvedValue(null);
    if (state === 'inactive-user')
      userRepo.findOne.mockResolvedValue(makeUser({ isActive: false }));
    if (state === 'missing-user') userRepo.findOne.mockResolvedValue(null);
    if (state === 'unknown-role')
      userRepo.findOne.mockResolvedValue(
        makeUser({ role: { code: 'LEGACY_MANAGER' } as User['role'] }),
      );
    if (state === 'expired') claims.exp = 1;
    if (state === 'wrong-type') Object.assign(claims, { type: 'refresh' });
    if (state === 'bad-sub') claims.sub = 'invalid';
    await expect(service.validatePayload(claims)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('rejects invalid signatures in the shared Socket authentication helper', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('bad signature'));
    await expect(
      service.authenticateAccessToken('forged'),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('revokes the matching user session on logout', async () => {
    await expect(service.revoke(userId, sessionId)).resolves.toHaveProperty(
      'message',
    );
    expect(sessionRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: sessionId, userId }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });
});
