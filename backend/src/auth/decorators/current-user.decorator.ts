import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RoleCode } from '../roles.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: RoleCode;
  sessionId: string;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();

    return request.user;
  },
);
