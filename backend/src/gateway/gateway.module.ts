import { Module } from '@nestjs/common';
import { GatewayAuthService } from './gateway-auth.service.js';
@Module({ providers: [GatewayAuthService], exports: [GatewayAuthService] })
export class GatewayModule {}
