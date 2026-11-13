import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import {
  Assignment,
  Incident,
  IncidentLog,
  Notification,
  User,
} from '../database/entities/index.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { PageDto } from './page.dto.js';

export const INCIDENT_STATUSES = [
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
] as const;
export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const ACTIVE_ASSIGNMENTS = ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'];
export function isManager(user: AuthenticatedUser) {
  return ['ADMIN', 'OPERATOR'].includes(user.role);
}
export function requireManager(user: AuthenticatedUser) {
  if (!isManager(user))
    throw new ForbiddenException('Cần quyền OPERATOR hoặc ADMIN.');
}
export function requireStatus(actual: string, allowed: readonly string[]) {
  if (!allowed.includes(actual))
    throw new ConflictException(`Không thể thực hiện ở trạng thái ${actual}.`);
}
export async function getIncident(
  manager: EntityManager,
  id: string,
  lock = false,
) {
  const incident = await manager.getRepository(Incident).findOne({
    where: { id },
    ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
  });
  if (!incident) throw new NotFoundException('Không tìm thấy sự cố.');
  return incident;
}
export async function requireIncidentAccess(
  manager: EntityManager,
  incident: Incident,
  user: AuthenticatedUser,
) {
  if (isManager(user) || incident.reporterId === user.id) return;
  if (user.role === 'SECURITY') {
    const assignment = await manager.getRepository(Assignment).findOneBy({
      incidentId: incident.id,
      securityUserId: user.id,
      status: In([...ACTIVE_ASSIGNMENTS, 'COMPLETED']),
    });
    if (assignment) return;
  }
  throw new ForbiddenException('Bạn không có quyền truy cập sự cố này.');
}
export async function recordLog(
  manager: EntityManager,
  incident: Incident,
  actorId: string,
  action: string,
  oldStatus: string | null,
  note: string | null = null,
  metadata: Record<string, unknown> | null = null,
) {
  const repo = manager.getRepository(IncidentLog);
  await repo.save(
    repo.create({
      incidentId: incident.id,
      actorId,
      action,
      oldStatus,
      newStatus: incident.status,
      note,
      metadata,
    }),
  );
}
export async function notify(
  manager: EntityManager,
  userIds: string[],
  incident: Incident,
  type: string,
  message: string,
) {
  const repo = manager.getRepository(Notification);
  const ids = [...new Set(userIds)];
  if (!ids.length) return [];
  return repo.save(
    ids.map((userId) =>
      repo.create({
        userId,
        incidentId: incident.id,
        type,
        title: incident.title,
        message,
        isRead: false,
        readAt: null,
      }),
    ),
  );
}
export async function managementIds(manager: EntityManager) {
  const users = await manager.getRepository(User).find({
    where: { isActive: true, role: { code: In(['ADMIN', 'OPERATOR']) } },
    select: { id: true },
  });
  return users.map((user) => user.id);
}
export function paginated<T>(items: T[], total: number, page = 1, limit = 10) {
  return new PageDto(items, total, page, limit);
}
