import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import { User, Role } from '../database/entities/index.js';
import { makeUser } from '../../test/fixtures.js';

describe('AuthService', () => {
  let users: {
    existsBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let roles: { findOneBy: jest.Mock };
  let sessions: { create: jest.Mock; refresh: jest.Mock; revoke: jest.Mock };
  let service: AuthService;
  const dto = {
    fullName: '  Test User  ',
    email: ' USER@EXAMPLE.COM ',
    password: 'Password123',
  };
  beforeEach(() => {
    users = {
      existsBy: jest.fn().mockResolvedValue(false),
      create: jest.fn((data) => Object.assign(makeUser(), data)),
      save: jest.fn(async (data) => data),
      createQueryBuilder: jest.fn(),
    };
    roles = {
      findOneBy: jest.fn().mockResolvedValue({ id: 4, code: 'REPORTER' }),
    };
    sessions = { create: jest.fn(), refresh: jest.fn(), revoke: jest.fn() };
    service = new AuthService(
      users as unknown as Repository<User>,
      roles as unknown as Repository<Role>,
      sessions as unknown as SessionService,
    );
  });
  it('normalizes email, hashes password, fixes Reporter role and excludes secrets', async () => {
    const result = await service.register(dto);
    const saved = users.save.mock.calls[0][0] as User;
    expect(saved.email).toBe('user@example.com');
    expect(saved.fullName).toBe('Test User');
    expect(await bcrypt.compare(dto.password, saved.passwordHash)).toBe(true);
    expect(saved.roleId).toBe(4);
    expect(JSON.stringify(result)).not.toMatch(/password|private-hash/i);
  });
  it('returns 409 for an existing email', async () => {
    users.existsBy.mockResolvedValue(true);
    await expect(service.register(dto)).rejects.toMatchObject({ status: 409 });
    expect(users.save).not.toHaveBeenCalled();
  });
  it('maps a concurrent unique constraint failure to 409', async () => {
    users.save.mockRejectedValue({ driverError: { code: '23505' } });
    await expect(service.register(dto)).rejects.toMatchObject({ status: 409 });
  });
  it('does not hide other database failures', async () => {
    users.save.mockRejectedValue(new Error('db unavailable'));
    await expect(service.register(dto)).rejects.toThrow('db unavailable');
  });
  it('requires a seeded Reporter role', async () => {
    roles.findOneBy.mockResolvedValue(null);
    await expect(service.register(dto)).rejects.toMatchObject({ status: 404 });
  });
  const selectUser = (user: User | null) => {
    const query = {
      addSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
    };
    return query;
  };
  it('issues a session only after valid credentials', async () => {
    const user = makeUser({ passwordHash: await bcrypt.hash(dto.password, 4) });
    users.createQueryBuilder.mockReturnValue(selectUser(user));
    sessions.create.mockResolvedValue({ accessToken: 'signed' });
    await expect(service.login(dto)).resolves.toEqual({
      accessToken: 'signed',
    });
    expect(sessions.create).toHaveBeenCalledWith(user);
  });
  it.each(['missing', 'inactive', 'wrong-password'])(
    'rejects %s credentials',
    async (state) => {
      const user = makeUser({
        isActive: state !== 'inactive',
        passwordHash: await bcrypt.hash('OtherPassword', 4),
      });
      users.createQueryBuilder.mockReturnValue(
        selectUser(state === 'missing' ? null : user),
      );
      await expect(service.login(dto)).rejects.toMatchObject({ status: 401 });
      expect(sessions.create).not.toHaveBeenCalled();
    },
  );
});
