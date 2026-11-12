import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service.js';
import {
  User,
  Role,
  AuthSession,
  UserAuditLog,
} from '../database/entities/index.js';
import { actor, userId, otherId, makeUser } from '../../test/fixtures.js';
import { ListUsersDto } from './dto/list-users.dto.js';

describe('UsersService', () => {
  let users: Record<string, jest.Mock>;
  let manager: Record<string, jest.Mock>;
  let user: User;
  let service: UsersService;
  beforeEach(() => {
    user = makeUser({ id: otherId });
    users = {
      findAndCount: jest.fn().mockResolvedValue([[user], 1]),
      findOne: jest.fn().mockResolvedValue(user),
    };
    manager = {
      query: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(async (_entity, options) =>
        options.where.id === userId
          ? makeUser({ role: { code: 'ADMIN' } as Role })
          : user,
      ),
      findOneOrFail: jest.fn().mockResolvedValue(user),
      findOneBy: jest.fn().mockResolvedValue({ id: 2, code: 'SECURITY' }),
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (_entity, data) => data),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      countBy: jest.fn().mockResolvedValue(0),
    };
    service = new UsersService(
      users as unknown as Repository<User>,
      {
        transaction: async (callback: (m: unknown) => unknown) =>
          callback(manager),
      } as unknown as DataSource,
    );
  });
  it('filters active Security with bounded pagination and hides contact data from Operator', async () => {
    const query = Object.assign(new ListUsersDto(), {
      role: 'SECURITY',
      isActive: false,
      page: 2,
      limit: 5,
    });
    const result = await service.findAll(query, { ...actor, role: 'OPERATOR' });
    expect(users.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: { code: 'SECURITY' }, isActive: false },
        skip: 5,
        take: 5,
      }),
    );
    expect(result.users[0]).not.toHaveProperty('email');
    expect(result.users[0]).not.toHaveProperty('phone');
    expect(result.users[0]).not.toHaveProperty('passwordHash');
  });
  it('denies Reporter user listing and returns 404 for missing users', async () => {
    await expect(
      service.findAll(new ListUsersDto(), actor),
    ).rejects.toMatchObject({ status: 403 });
    users.findOne.mockResolvedValue(null);
    await expect(service.findOne(otherId)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('records a role change atomically with session revocation', async () => {
    await service.updateRole(otherId, 2, userId);
    expect(user.roleId).toBe(2);
    expect(manager.update).toHaveBeenCalledWith(
      AuthSession,
      expect.objectContaining({ userId: otherId }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      UserAuditLog,
      expect.objectContaining({
        actorId: userId,
        targetUserId: otherId,
        action: 'ROLE_CHANGED',
        changes: { roleId: { from: 4, to: 2 } },
      }),
    );
  });
  it('denies an administrator whose permissions changed before the transaction', async () => {
    manager.findOne.mockResolvedValue(makeUser());
    await expect(
      service.updateStatus(otherId, false, userId),
    ).rejects.toMatchObject({ status: 403 });
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('prevents self-locking and self-demotion', async () => {
    await expect(
      service.updateStatus(userId, false, userId),
    ).rejects.toMatchObject({ status: 409 });
    await expect(service.updateRole(userId, 2, userId)).rejects.toMatchObject({
      status: 409,
    });
  });
  it('does not revoke sessions for an unchanged role', async () => {
    await service.updateRole(otherId, 4, userId);
    expect(manager.update).not.toHaveBeenCalled();
  });
  it('locks accounts and records both values without secrets', async () => {
    await service.updateStatus(otherId, false, userId);
    expect(user.isActive).toBe(false);
    expect(manager.save).toHaveBeenCalledWith(
      UserAuditLog,
      expect.objectContaining({
        changes: { isActive: { from: true, to: false } },
      }),
    );
    expect(
      JSON.stringify(
        manager.save.mock.calls.filter(([entity]) => entity === UserAuditLog),
      ),
    ).not.toMatch(/password/i);
  });
  it('updates only profile fields and invalidates sessions after an email change', async () => {
    await service.update(otherId, {
      fullName: ' New Name ',
      email: ' NEW@EXAMPLE.COM ',
      phone: '',
    });
    expect(user).toMatchObject({
      fullName: 'New Name',
      email: 'new@example.com',
      phone: null,
      emailVerified: false,
      roleId: 4,
    });
    expect(manager.update).toHaveBeenCalledWith(
      AuthSession,
      expect.objectContaining({ userId: otherId }),
      expect.any(Object),
    );
  });
  it('creates internal users with hashed passwords and audits the assigned role', async () => {
    const result = await service.create(
      {
        fullName: ' Security User ',
        email: ' SECURITY@EXAMPLE.COM ',
        password: 'Password123',
        role: 'SECURITY',
      },
      userId,
    );
    const saved = manager.save.mock.calls.find(
      ([entity]) => entity === User,
    )![1] as User;
    expect(await bcrypt.compare('Password123', saved.passwordHash)).toBe(true);
    expect(saved.email).toBe('security@example.com');
    expect(JSON.stringify(result)).not.toMatch(/password/i);
    expect(manager.save).toHaveBeenCalledWith(
      UserAuditLog,
      expect.objectContaining({ action: 'USER_CREATED' }),
    );
  });
  describe('password changes', () => {
    const dto = {
      currentPassword: 'CurrentPass123',
      newPassword: 'NewPassword123',
      confirmPassword: 'NewPassword123',
    };
    beforeEach(async () => {
      user.passwordHash = await bcrypt.hash(dto.currentPassword, 4);
      const builder = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(user),
      };
      manager.getRepository = jest
        .fn()
        .mockReturnValue({ createQueryBuilder: () => builder });
    });
    it('verifies the current password, saves a hash and revokes every session', async () => {
      await service.changePassword(otherId, dto);
      expect(await bcrypt.compare(dto.newPassword, user.passwordHash)).toBe(
        true,
      );
      expect(manager.update).toHaveBeenCalledWith(
        AuthSession,
        expect.objectContaining({ userId: otherId }),
        expect.any(Object),
      );
    });
    it.each(['wrong-current', 'mismatch', 'unchanged'])(
      'rejects %s password',
      async (state) => {
        const input = { ...dto };
        if (state === 'wrong-current') input.currentPassword = 'WrongPassword';
        if (state === 'mismatch') input.confirmPassword = 'DifferentPass';
        if (state === 'unchanged')
          input.newPassword = input.confirmPassword = dto.currentPassword;
        await expect(
          service.changePassword(otherId, input),
        ).rejects.toHaveProperty(
          'status',
          state === 'wrong-current' ? 401 : state === 'mismatch' ? 400 : 409,
        );
        expect(manager.save).not.toHaveBeenCalled();
      },
    );
  });
});
