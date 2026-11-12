import {
  Injectable,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class CookieOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.get('origin');
    const allowed = this.config
      .getOrThrow<string>('FRONTEND_URL')
      .split(',')
      .map((value) => value.trim());
    if (
      (origin && !allowed.includes(origin)) ||
      (!origin && request.get('sec-fetch-site') === 'cross-site')
    ) {
      throw new ForbiddenException('Nguồn yêu cầu không được phép.');
    }
    return true;
  }
}
