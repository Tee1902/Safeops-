import { Controller, Get, Patch, Body, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ROLE_CODES } from '../auth/roles.js';
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
} from '../auth/refresh-cookie.js';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

@ApiTags('Profile')
@ApiBearerAuth()
@Roles(...ROLE_CODES)
@Controller('users/me')
export class ProfileController {
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}
  @Get()
  @ApiOperation({ summary: 'Xem hồ sơ của chính mình' })
  getProfile(@CurrentUser() actor: AuthenticatedUser) {
    return this.users.findOne(actor.id);
  }
  @Patch()
  @ApiOperation({
    summary: 'Cập nhật hồ sơ cá nhân; thay email sẽ thu hồi phiên',
  })
  updateProfile(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actor.id, dto);
  }
  @Patch('password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Đổi mật khẩu hiện tại và đăng xuất tất cả phiên' })
  async changePassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.users.changePassword(actor.id, dto);
    response.clearCookie(
      REFRESH_COOKIE,
      refreshCookieOptions(
        this.config.getOrThrow<string>('COOKIE_SECURE') === 'true',
      ),
    );
    return result;
  }
}
