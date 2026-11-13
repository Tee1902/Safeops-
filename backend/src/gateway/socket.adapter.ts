import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

export class SafeOpsSocketAdapter extends IoAdapter {
  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const origins = this.app
      .get(ConfigService)
      .getOrThrow<string>('FRONTEND_URL')
      .split(',')
      .map((origin) => origin.trim());
    return super.createIOServer(port, {
      ...options,
      cors: { origin: origins, credentials: true },
      // CORS alone does not protect WebSocket upgrades.
      allowRequest: (request, callback) =>
        callback(
          null,
          !request.headers.origin || origins.includes(request.headers.origin),
        ),
      maxHttpBufferSize: 16 * 1024,
    } as ServerOptions);
  }
}
