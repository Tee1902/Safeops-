import { Module } from '@nestjs/common';
import { GatewayAuthService } from './gateway-auth.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
@Module({
  imports: [AuthModule],
  providers: [GatewayAuthService, RealtimeGateway],
  exports: [GatewayAuthService, RealtimeGateway],
})
export class GatewayModule {}
