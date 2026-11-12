import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { isUUID } from 'class-validator';
import { AuthSession, User } from '../database/entities/index.js';
import { ROLE_CODES, type RoleCode } from './roles.js';
import { presentUser } from '../users/user.presenter.js';

export interface AccessPayload {
  sub: string;
  sid: string;
  role: RoleCode;
  type: 'access';
  exp: number;
}
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class SessionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private async result(user: User, session: AuthSession, refreshToken: string) {
    return {
      accessToken: await this.jwt.signAsync(
        {
          sub: user.id,
          sid: session.id,
          email: user.email,
          role: user.role.code,
          type: 'access',
        },
        { jwtid: randomUUID() },
      ),
      tokenType: 'Bearer' as const,
      expiresIn: this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'),
      user: presentUser(user),
      refreshToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

  async create(validatedUser: User) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('user.id = :id', { id: validatedUser.id })
        .setLock('pessimistic_write')
        .getOne();
      if (!user?.isActive || user.passwordHash !== validatedUser.passwordHash)
        throw new UnauthorizedException('Vui lòng đăng nhập lại.');
      // Đọc lại role sau khi lấy khóa, tránh cấp quyền cũ khi quản trị vừa thay đổi.
      const current = await manager
        .getRepository(User)
        .findOneOrFail({ where: { id: user.id }, relations: { role: true } });
      user.role = current.role;
      if (!ROLE_CODES.includes(user.role.code as RoleCode))
        throw new UnauthorizedException('Vai trò không hợp lệ.');
      await manager.update(User, user.id, { lastLoginAt: new Date() });
      user.lastLoginAt = new Date();
      const id = randomUUID();
      const refreshToken = `${id}.${randomBytes(32).toString('base64url')}`;
      const session = manager.create(AuthSession, {
        id,
        userId: user.id,
        refreshTokenHash: hash(refreshToken),
        revokedAt: null,
        expiresAt: new Date(
          Date.now() +
            this.config.getOrThrow<number>('JWT_REFRESH_TTL_SECONDS') * 1000,
        ),
      });
      await manager.save(AuthSession, session);
      return this.result(user, session, refreshToken);
    });
  }

  async refresh(token?: string) {
    const parts = token?.split('.');
    if (
      !parts ||
      parts.length !== 2 ||
      !isUUID(parts[0], '4') ||
      !/^[A-Za-z0-9_-]{43}$/.test(parts[1])
    ) {
      throw new UnauthorizedException('Refresh token không hợp lệ.');
    }
    return this.dataSource.transaction(async (manager) => {
      const session = await manager
        .getRepository(AuthSession)
        .createQueryBuilder('session')
        .addSelect('session.refreshTokenHash')
        .where('session.id = :id', { id: parts[0] })
        .setLock('pessimistic_write')
        .getOne();
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now() ||
        !timingSafeEqual(
          Buffer.from(session.refreshTokenHash, 'hex'),
          Buffer.from(hash(token!), 'hex'),
        )
      ) {
        throw new UnauthorizedException(
          'Refresh token không hợp lệ hoặc đã hết hạn.',
        );
      }
      const user = await manager.findOne(User, {
        where: { id: session.userId },
        relations: { role: true },
      });
      if (
        !user?.isActive ||
        !user.role ||
        !ROLE_CODES.includes(user.role.code as RoleCode)
      )
        throw new UnauthorizedException('Tài khoản không hoạt động.');
      const nextToken = `${session.id}.${randomBytes(32).toString('base64url')}`;
      session.refreshTokenHash = hash(nextToken);
      await manager.save(AuthSession, session);
      return this.result(user, session, nextToken);
    });
  }

  async validatePayload(payload: AccessPayload) {
    if (
      payload.type !== 'access' ||
      !isUUID(payload.sub, '4') ||
      !isUUID(payload.sid, '4') ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Date.now() / 1000
    )
      throw new UnauthorizedException('Token không hợp lệ.');
    const session = await this.dataSource.getRepository(AuthSession).findOne({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!session)
      throw new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn hoặc bị thu hồi.',
      );
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: payload.sub }, relations: { role: true } });
    if (
      !user?.isActive ||
      !user.role ||
      !ROLE_CODES.includes(user.role.code as RoleCode)
    )
      throw new UnauthorizedException('Tài khoản không hoạt động.');
    return {
      id: user.id,
      email: user.email,
      role: user.role.code as RoleCode,
      sessionId: session.id,
    };
  }

  async authenticateAccessToken(token: string) {
    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        algorithms: ['HS256'],
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      });
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn.');
    }
    return this.validatePayload(payload);
  }

  async revoke(userId: string, sessionId: string) {
    await this.dataSource
      .getRepository(AuthSession)
      .update(
        { id: sessionId, userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    return { message: 'Đăng xuất thành công.' };
  }
}
