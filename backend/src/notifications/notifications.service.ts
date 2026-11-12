import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Notification } from '../database/entities/index.js';
import { paginated } from '../common/workflow.js';
import { NotificationQueryDto } from './notifications.dto.js';
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DataSource) {}
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
    return {
      ...paginated(items, total, page, limit),
      unreadCount: await repo.countBy({ userId, isRead: false }),
    };
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
    return notification;
  }
  async readAll(userId: string) {
    const result = await this.db
      .getRepository(Notification)
      .update({ userId, isRead: false }, { isRead: true, readAt: new Date() });
    return { updated: result.affected ?? 0 };
  }
}
