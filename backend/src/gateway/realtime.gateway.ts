import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, In } from 'typeorm';
import type { Server, Socket } from 'socket.io';
import { GatewayAuthService } from './gateway-auth.service.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { Assignment } from '../database/entities/index.js';
import { ACTIVE_ASSIGNMENTS } from '../common/workflow.js';
import { LocationSharingDto, LocationUpdateDto } from './location.dto.js';

type Client = Socket & { data: { token: string; user: AuthenticatedUser } };
type Ack = (result: unknown) => void;
interface Sharing {
  assignmentId: string;
  userId: string;
}
export const managementRooms = ['role:operator', 'role:admin'];

@Injectable()
@WebSocketGateway()
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly sharing = new Map<string, Sharing>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly busy = new Set<string>();
  private readonly lastLocationAt = new Map<string, number>();

  constructor(
    private readonly auth: GatewayAuthService,
    private readonly db: DataSource,
  ) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      const authToken: unknown = socket.handshake.auth?.token;
      const header = socket.handshake.headers.authorization;
      const token =
        typeof authToken === 'string'
          ? authToken
          : header?.replace(/^Bearer\s+/i, '');
      if (!token || token.length > 8192) return next(new Error('UNAUTHORIZED'));
      void this.auth
        .authenticate(token)
        .then(async (user) => {
          socket.data = { token, user };
          await socket.join([
            `user:${user.id}`,
            `role:${user.role.toLowerCase()}`,
          ]);
          next();
        })
        .catch(() => next(new Error('UNAUTHORIZED')));
    });
  }

  handleConnection(socket: Client) {
    // Raw listeners deliberately use the same session service as HTTP and explicit
    // DTO validation. HTTP guards/filters must never process socket packets.
    socket.on('security:location-sharing', (body: unknown, ack?: Ack) => {
      void this.receive(socket, body, LocationSharingDto, ack, (dto) =>
        this.setSharing(socket, dto),
      );
    });
    socket.on('security:location', (body: unknown, ack?: Ack) => {
      void this.receive(socket, body, LocationUpdateDto, ack, (dto) =>
        this.updateLocation(socket, dto),
      );
    });
    const timer = setInterval(() => {
      void this.authenticate(socket).catch(() => {});
    }, 15000);
    timer.unref();
    this.timers.set(socket.id, timer);
    socket.emit('realtime:ready', { resyncRequired: true });
  }

  handleDisconnect(socket: Client) {
    clearInterval(this.timers.get(socket.id));
    this.timers.delete(socket.id);
    this.busy.delete(socket.id);
    void this.clearSharing(socket.id).catch(() => {});
  }

  onModuleDestroy() {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    this.sharing.clear();
    this.lastLocationAt.clear();
  }

  private async authenticate(socket: Client) {
    try {
      const user = await this.auth.authenticate(socket.data.token);
      if (
        user.id !== socket.data.user.id ||
        user.role !== socket.data.user.role
      )
        throw new Error('Role changed');
      return user;
    } catch {
      socket.disconnect(true);
      throw new ForbiddenException('UNAUTHORIZED');
    }
  }

  /** Revalidate before delivery so revoked sessions cannot keep receiving room data. */
  async emitToRooms(
    rooms: string[],
    event: string,
    payload: unknown,
    isCurrent: () => boolean = () => true,
  ) {
    if (!this.server) return;
    const clients = [...this.server.sockets.sockets.values()].filter((socket) =>
      rooms.some((room) => socket.rooms.has(room)),
    );
    await Promise.all(
      clients.map(async (socket) => {
        try {
          await this.authenticate(socket as Client);
          if (socket.connected && isCurrent()) socket.emit(event, payload);
        } catch {
          /* A revoked or expired session has already been disconnected. */
        }
      }),
    );
  }

  private async receive<T extends object>(
    socket: Client,
    body: unknown,
    dtoType: new () => T,
    ack: Ack | undefined,
    handler: (dto: T) => Promise<unknown>,
  ) {
    if (this.busy.has(socket.id)) {
      if (typeof ack === 'function')
        ack({ success: false, error: { code: 'RATE_LIMITED' } });
      return;
    }
    let result: unknown;
    try {
      this.busy.add(socket.id);
      await this.authenticate(socket);
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new BadRequestException('VALIDATION_ERROR');
      const dto = plainToInstance(dtoType, body);
      if (
        (
          await validate(dto, {
            whitelist: true,
            forbidNonWhitelisted: true,
            forbidUnknownValues: true,
          })
        ).length
      )
        throw new BadRequestException('VALIDATION_ERROR');
      result = { success: true, data: await handler(dto) };
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      const code =
        (
          {
            400: 'VALIDATION_ERROR',
            403: 'FORBIDDEN',
            429: 'RATE_LIMITED',
          } as Record<number, string>
        )[status] ?? 'INTERNAL_ERROR';
      if (status === 500) this.logger.error('Socket event failed');
      result = { success: false, error: { code } };
    } finally {
      this.busy.delete(socket.id);
    }
    if (typeof ack === 'function') ack(result);
  }

  private async requireDuty(socket: Client, assignmentId: string) {
    if (socket.data.user.role !== 'SECURITY') throw new ForbiddenException();
    const assignment = await this.db.getRepository(Assignment).findOne({
      where: {
        id: assignmentId,
        securityUserId: socket.data.user.id,
        status: In(ACTIVE_ASSIGNMENTS),
        incident: { status: In(['ASSIGNED', 'IN_PROGRESS']) },
      },
    });
    if (!assignment) {
      await this.clearSharing(socket.id);
      throw new ForbiddenException();
    }
    return assignment;
  }

  private async setSharing(socket: Client, dto: LocationSharingDto) {
    if (!dto.enabled) {
      if (socket.data.user.role !== 'SECURITY') throw new ForbiddenException();
      await this.clearSharing(socket.id);
      return { enabled: false };
    }
    await this.requireDuty(socket, dto.assignmentId);
    await this.clearSharing(socket.id);
    await this.stopAssignment(dto.assignmentId);
    if (!socket.connected) throw new ForbiddenException();
    this.sharing.set(socket.id, {
      assignmentId: dto.assignmentId,
      userId: socket.data.user.id,
    });
    return { enabled: true };
  }

  private async updateLocation(socket: Client, dto: LocationUpdateDto) {
    const share = this.sharing.get(socket.id);
    if (!share || share.assignmentId !== dto.assignmentId)
      throw new ForbiddenException();
    const now = Date.now();
    for (const [userId, last] of this.lastLocationAt)
      if (now - last > 60000) this.lastLocationAt.delete(userId);
    if (now - (this.lastLocationAt.get(share.userId) ?? 0) < 5000)
      throw new HttpException('RATE_LIMITED', 429);
    this.lastLocationAt.set(share.userId, now);
    const assignment = await this.requireDuty(socket, dto.assignmentId);
    if (!socket.connected || this.sharing.get(socket.id) !== share)
      throw new ForbiddenException();
    await this.emitToRooms(
      managementRooms,
      'security:location',
      {
        userId: share.userId,
        assignmentId: assignment.id,
        incidentId: assignment.incidentId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        updatedAt: new Date().toISOString(),
      },
      () => this.sharing.get(socket.id) === share && socket.connected,
    );
    return { accepted: true };
  }

  async stopAssignment(assignmentId: string) {
    for (const [socketId, share] of this.sharing)
      if (share.assignmentId === assignmentId)
        await this.clearSharing(socketId);
  }

  private async clearSharing(socketId: string) {
    const share = this.sharing.get(socketId);
    if (!share) return;
    this.sharing.delete(socketId);
    await this.emitToRooms(managementRooms, 'security:location-cleared', {
      userId: share.userId,
      assignmentId: share.assignmentId,
    });
  }
}
