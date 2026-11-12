import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  IsNull,
  In,
  type EntityManager,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  User,
  Role,
  AuthSession,
  UserAuditLog,
  Assignment,
} from '../database/entities/index.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { ROLE_CODES, type RoleCode } from '../auth/roles.js';
import { presentUser } from './user.presenter.js';
import { isUniqueViolation } from '../common/database-errors.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { PaginationDto } from './dto/pagination.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ACTIVE_ASSIGNMENTS } from '../common/workflow.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: ListUsersDto, actor: AuthenticatedUser) {
    if (!['ADMIN', 'OPERATOR'].includes(actor.role))
      throw new ForbiddenException();
    const { page, limit } = query;
    const [users, total] = await this.users.findAndCount({
      where: {
        ...(query.role ? { role: { code: query.role } } : {}),
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      },
      relations: { role: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      users: users.map((user) =>
        actor.role === 'ADMIN'
          ? presentUser(user)
          : {
              id: user.id,
              fullName: user.fullName,
              role: user.role.code,
              isActive: user.isActive,
              avatarUrl: user.avatarUrl,
            },
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const user = await this.users.findOne({
      where: { id },
      relations: { role: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    return presentUser(user);
  }

  private async requireAdmin(manager: EntityManager, actorId: string) {
    // Tuần tự hóa thay đổi quản trị để hai Admin không thể đồng thời hạ quyền nhau.
    await manager.query('SELECT pg_advisory_xact_lock(1396786767)');
    const actor = await manager.findOne(User, {
      where: { id: actorId },
      relations: { role: true },
    });
    if (!actor?.isActive || actor.role.code !== 'ADMIN')
      throw new ForbiddenException('Chỉ Admin được quản trị người dùng.');
  }

  private async audit(
    manager: EntityManager,
    actorId: string,
    targetUserId: string,
    action: string,
    changes: Record<string, unknown>,
  ) {
    await manager.save(
      UserAuditLog,
      manager.create(UserAuditLog, { actorId, targetUserId, action, changes }),
    );
  }

  async create(dto: CreateUserDto, actorId: string) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.requireAdmin(manager, actorId);
        const role = await manager.findOneBy(Role, { code: dto.role });
        if (!role) throw new NotFoundException('Vai trò không tồn tại.');
        const user = await manager.save(
          User,
          manager.create(User, {
            fullName: dto.fullName.trim(),
            email: dto.email.trim().toLowerCase(),
            phone: dto.phone?.trim() || null,
            passwordHash,
            roleId: role.id,
            isActive: true,
            emailVerified: false,
            lastLoginAt: null,
          }),
        );
        user.role = role;
        await this.audit(manager, actorId, user.id, 'USER_CREATED', {
          roleId: role.id,
          isActive: true,
        });
        return {
          message: 'Tạo tài khoản thành công.',
          user: presentUser(user),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Email đã được sử dụng.');
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto, actorId?: string) {
    if (!Object.values(dto).some((value) => value !== undefined))
      throw new BadRequestException('Cần ít nhất một trường cập nhật.');
    try {
      return await this.dataSource.transaction(async (manager) => {
        if (actorId) await this.requireAdmin(manager, actorId);
        const user = await manager.findOne(User, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
        const changes: Record<string, unknown> = {};
        const emailChanged =
          dto.email !== undefined &&
          user.email !== dto.email.trim().toLowerCase();
        for (const key of [
          'fullName',
          'email',
          'phone',
          'avatarUrl',
        ] as const) {
          if (dto[key] !== undefined) {
            const next =
              key === 'email'
                ? dto[key]!.trim().toLowerCase()
                : dto[key]?.trim() || null;
            if (user[key] !== next) {
              changes[key] = { from: user[key], to: next };
              Object.assign(user, { [key]: next });
            }
          }
        }
        if (emailChanged) {
          user.emailVerified = false;
          await manager.update(
            AuthSession,
            { userId: id, revokedAt: IsNull() },
            { revokedAt: new Date() },
          );
        }
        await manager.save(User, user);
        if (actorId && Object.keys(changes).length)
          await this.audit(manager, actorId, id, 'PROFILE_UPDATED', changes);
        const loaded = await manager.findOneOrFail(User, {
          where: { id },
          relations: { role: true },
        });
        return presentUser(loaded);
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Email đã được sử dụng.');
      throw error;
    }
  }

  private async changeAccess(
    id: string,
    actorId: string,
    changes: { roleId?: number; isActive?: boolean },
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.requireAdmin(manager, actorId);
      const user = await manager.findOne(User, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
      if (
        id === actorId &&
        (changes.isActive === false ||
          (changes.roleId !== undefined && changes.roleId !== user.roleId))
      ) {
        throw new ConflictException(
          'Không thể tự khóa hoặc tự thay đổi vai trò Admin của mình.',
        );
      }
      if (changes.roleId !== undefined) {
        const role = await manager.findOneBy(Role, { id: changes.roleId });
        if (!role || !ROLE_CODES.includes(role.code as RoleCode))
          throw new NotFoundException('Vai trò không tồn tại.');
        const currentRole = await manager.findOneBy(Role, { id: user.roleId });
        if (currentRole?.code === 'ADMIN' && changes.roleId !== user.roleId)
          throw new ConflictException('API này không thay đổi vai trò ADMIN.');
      }
      if (
        (changes.roleId !== undefined && changes.roleId !== user.roleId) ||
        (changes.isActive === false && user.isActive)
      ) {
        if (
          await manager.countBy(Assignment, {
            securityUserId: id,
            status: In(ACTIVE_ASSIGNMENTS),
          })
        )
          throw new ConflictException(
            'Nhân viên còn phân công đang xử lý. Hãy hủy hoặc giao lại trước.',
          );
      }
      const auditChanges: Record<string, unknown> = {};
      for (const key of ['roleId', 'isActive'] as const) {
        if (changes[key] !== undefined && changes[key] !== user[key]) {
          auditChanges[key] = { from: user[key], to: changes[key] };
          Object.assign(user, { [key]: changes[key] });
        }
      }
      if (Object.keys(auditChanges).length) {
        await manager.save(User, user);
        await manager.update(
          AuthSession,
          { userId: id, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
        await this.audit(
          manager,
          actorId,
          id,
          changes.roleId !== undefined ? 'ROLE_CHANGED' : 'STATUS_CHANGED',
          auditChanges,
        );
      }
      const loaded = await manager.findOneOrFail(User, {
        where: { id },
        relations: { role: true },
      });
      return {
        message: 'Cập nhật quyền truy cập thành công.',
        user: presentUser(loaded),
      };
    });
  }

  updateStatus(id: string, isActive: boolean, actorId: string) {
    return this.changeAccess(id, actorId, { isActive });
  }
  updateRole(id: string, roleId: number, actorId: string) {
    return this.changeAccess(id, actorId, { roleId });
  }

  async auditLogs(id: string, query: PaginationDto) {
    await this.findOne(id);
    const { page, limit } = query;
    const [logs, total] = await this.dataSource
      .getRepository(UserAuditLog)
      .findAndCount({
        where: { targetUserId: id },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword)
      throw new BadRequestException('Mật khẩu xác nhận không khớp.');
    return this.dataSource.transaction(async (manager) => {
      const user = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('user.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
      if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash)))
        throw new UnauthorizedException('Mật khẩu hiện tại không chính xác.');
      if (await bcrypt.compare(dto.newPassword, user.passwordHash))
        throw new ConflictException(
          'Mật khẩu mới phải khác mật khẩu hiện tại.',
        );
      user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
      await manager.save(User, user);
      await manager.update(
        AuthSession,
        { userId: id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
    });
  }
}
