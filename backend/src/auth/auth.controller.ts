import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from './decorators/current-user.decorator.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { Roles } from './decorators/roles.decorator.js';
import { ROLE_CODES } from './roles.js';
import { Public } from './decorators/public.decorator.js';
import { CookieOriginGuard } from './guards/cookie-origin.guard.js';
import {
  readRefreshCookie,
  REFRESH_COOKIE,
  refreshCookieOptions,
} from './refresh-cookie.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}
  private cookieOptions() {
    return refreshCookieOptions(
      this.config.getOrThrow<string>('COOKIE_SECURE') === 'true',
    );
  }

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Đăng ký Reporter; email trùng trả 409' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(CookieOriginGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Đăng nhập; trả access token và đặt refresh cookie HttpOnly',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { refreshToken, refreshExpiresAt, ...result } =
      await this.authService.login(dto);
    response.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.cookieOptions(),
      expires: refreshExpiresAt,
    });
    response.setHeader('Cache-Control', 'no-store');
    return { message: 'Đăng nhập thành công.', ...result };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(CookieOriginGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({ summary: 'Xoay refresh cookie và cấp access token mới' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { refreshToken, refreshExpiresAt, ...result } =
      await this.authService.refresh(readRefreshCookie(request));
    response.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.cookieOptions(),
      expires: refreshExpiresAt,
    });
    response.setHeader('Cache-Control', 'no-store');
    return result;
  }

  @Roles(...ROLE_CODES)
  @Post('logout')
  @HttpCode(200)
  @UseGuards(CookieOriginGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thu hồi cả phiên và xóa refresh cookie' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.logout(user.id, user.sessionId);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return result;
  }

  @Roles(...ROLE_CODES)
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thông tin danh tính hiện tại (alias; hồ sơ đầy đủ ở users/me)',
  })
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }
}
