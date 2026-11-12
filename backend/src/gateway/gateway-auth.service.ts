import { Injectable } from '@nestjs/common';
import { SessionService } from '../auth/session.service.js';
@Injectable()
export class GatewayAuthService {
  constructor(private readonly sessions: SessionService) {}
  // BE3 dùng cùng cơ chế kiểm tra phiên/role khi handshake và xử lý socket event.
  authenticate(token: string) {
    return this.sessions.authenticateAccessToken(token);
  }
}
