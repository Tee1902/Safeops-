import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Notification } from '../database/entities/index.js';
import { paginated } from '../common/workflow.js';
import { NotificationQueryDto } from './notifications.dto.js';
import { RealtimeGateway } from '../gateway/realtime.gateway.js';
@Injectable()
export class NotificationsService {
  constructor(
    private readonly db: DataSource,
    private readonly gateway: RealtimeGateway,
  ) {}
  async list(userId: string, query: NotificationQueryDto) {
    const { page, limit } = query;
    const repo = this.db.getRepository(Notification);
    const [items, total] = await repo.findAndCount({
      where: {
        userId,
        ...(query.isRead !== undefined
          ? { isRead: query.isRead === 'true' }
          : {}),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return Object.assign(paginated(items, total, page, limit), {
      unreadCount: await repo.countBy({ userId, isRead: false }),
    });
  }
  async read(userId: string, id: string) {
    const repo = this.db.getRepository(Notification);
    // Only unread rows are updated, preserving the original read timestamp.
    await repo.update(
      { id, userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    const notification = await repo.findOneBy({ id, userId });
    if (!notification) throw new NotFoundException('Không tìm thấy thông báo.');
    await this.changed(userId);
    return notification;
  }
  async readAll(userId: string) {
    const result = await this.db
      .getRepository(Notification)
      .update({ userId, isRead: false }, { isRead: true, readAt: new Date() });
    await this.changed(userId);
    return { updated: result.affected ?? 0 };
  }
  private async changed(userId: string) {
    const unreadCount = await this.db
      .getRepository(Notification)
      .countBy({ userId, isRead: false });
    await this.gateway.emitToRooms([`user:${userId}`], 'notification:read', {
      unreadCount,
    });
  }
}
