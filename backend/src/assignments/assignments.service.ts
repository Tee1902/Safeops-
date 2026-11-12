import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  Assignment,
  Incident,
  Role,
  User,
} from '../database/entities/index.js';
import {
  ACTIVE_ASSIGNMENTS,
  getIncident,
  managementIds,
  notify,
  paginated,
  recordLog,
  requireIncidentAccess,
  requireManager,
  requireStatus,
} from '../common/workflow.js';
import { AssignmentQueryDto, CreateAssignmentDto } from './assignments.dto.js';
import { PaginationDto } from '../users/dto/pagination.dto.js';
@Injectable()
export class AssignmentsService {
  constructor(private readonly db: DataSource) {}
  async securityUsers(query: PaginationDto) {
    const { page, limit } = query;
    const [items, total] = await this.db.getRepository(User).findAndCount({
      where: { isActive: true, role: { code: 'SECURITY' } },
      select: { id: true, fullName: true },
      order: { fullName: 'ASC', id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginated(items, total, page, limit);
  }
  async create(
    incidentId: string,
    dto: CreateAssignmentDto,
    user: AuthenticatedUser,
  ) {
    requireManager(user);
    return this.db.transaction(async (manager) => {
      const incident = await getIncident(manager, incidentId, true);
      requireStatus(incident.status, ['VERIFIED']);
      const repo = manager.getRepository(Assignment);
      if (await repo.countBy({ incidentId, status: In(ACTIVE_ASSIGNMENTS) }))
        throw new ConflictException('Sự cố đã có nhân viên phụ trách.');
      const security = await manager.getRepository(User).findOne({
        where: { id: dto.securityUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!security || !security.isActive)
        throw new NotFoundException('Nhân viên không tồn tại hoặc đã bị khóa.');
      const role = await manager
        .getRepository(Role)
        .findOneBy({ id: security.roleId });
      if (role?.code !== 'SECURITY')
        throw new ConflictException('Chỉ được giao cho nhân viên SECURITY.');
      const assignment = await repo.save(
        repo.create({
          incidentId,
          securityUserId: security.id,
          assignedBy: user.id,
          note: dto.note?.trim() || null,
          status: 'ASSIGNED',
          acceptedAt: null,
          startedAt: null,
          completedAt: null,
        }),
      );
      incident.status = 'ASSIGNED';
      await manager.getRepository(Incident).save(incident);
      await recordLog(
        manager,
        incident,
        user.id,
        'ASSIGNED',
        'VERIFIED',
        assignment.note,
        { assignmentId: assignment.id, securityUserId: security.id },
      );
      await notify(
        manager,
        [security.id, incident.reporterId],
        incident,
        'ASSIGNMENT_CREATED',
        'Sự cố đã được phân công cho nhân viên an ninh.',
      );
      return assignment;
    });
  }
  async mine(user: AuthenticatedUser, query: AssignmentQueryDto) {
    const { page, limit } = query;
    const [items, total] = await this.db
      .getRepository(Assignment)
      .findAndCount({
        where: {
          securityUserId: user.id,
          ...(query.status ? { status: query.status } : {}),
        },
        relations: { incident: true },
        order: { assignedAt: 'DESC', id: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    // Keep assignment history without disclosing an incident after access is revoked.
    return paginated(
      items.map((item) => {
        if (
          item.status === 'CANCELLED' &&
          item.incident?.reporterId !== user.id
        ) {
          const { incident: _incident, ...history } = item;
          return history;
        }
        return item;
      }),
      total,
      page,
      limit,
    );
  }
  async forIncident(
    incidentId: string,
    user: AuthenticatedUser,
    query: PaginationDto,
  ) {
    const incident = await getIncident(this.db.manager, incidentId);
    await requireIncidentAccess(this.db.manager, incident, user);
    const { page, limit } = query;
    const [items, total] = await this.db
      .getRepository(Assignment)
      .findAndCount({
        where: { incidentId },
        order: { assignedAt: 'DESC', id: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    return paginated(items, total, page, limit);
  }
  async transition(
    id: string,
    action: 'accept' | 'start' | 'complete' | 'cancel',
    user: AuthenticatedUser,
    note?: string,
  ) {
    if (action === 'cancel') requireManager(user);
    else if (user.role !== 'SECURITY')
      throw new ForbiddenException('Cần quyền SECURITY.');
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(Assignment);
      const initial = await repo.findOneBy({ id });
      if (!initial) throw new NotFoundException('Không tìm thấy phân công.');
      // All workflow mutations lock the incident first to serialize its state changes.
      const incident = await getIncident(manager, initial.incidentId, true);
      const assignment = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!assignment) throw new NotFoundException('Không tìm thấy phân công.');
      if (action !== 'cancel' && assignment.securityUserId !== user.id)
        throw new ForbiddenException('Phân công không thuộc về bạn.');
      const oldStatus = incident.status;
      const now = new Date();
      if (action === 'accept') {
        requireStatus(assignment.status, ['ASSIGNED']);
        requireStatus(incident.status, ['ASSIGNED']);
        assignment.status = 'ACCEPTED';
        assignment.acceptedAt = now;
      } else if (action === 'start') {
        requireStatus(assignment.status, ['ACCEPTED']);
        requireStatus(incident.status, ['ASSIGNED']);
        assignment.status = 'IN_PROGRESS';
        assignment.startedAt = now;
        incident.status = 'IN_PROGRESS';
      } else if (action === 'complete') {
        requireStatus(assignment.status, ['IN_PROGRESS']);
        requireStatus(incident.status, ['IN_PROGRESS']);
        assignment.status = 'COMPLETED';
        assignment.completedAt = now;
        incident.status = 'RESOLVED';
        incident.resolvedAt = now;
      } else {
        requireStatus(assignment.status, ACTIVE_ASSIGNMENTS);
        requireStatus(incident.status, ['ASSIGNED', 'IN_PROGRESS']);
        assignment.status = 'CANCELLED';
        incident.status = 'VERIFIED';
      }
      await repo.save(assignment);
      await manager.getRepository(Incident).save(incident);
      const logAction = {
        accept: 'ACCEPTED',
        start: 'STARTED',
        complete: 'RESOLVED',
        cancel: 'ASSIGNMENT_CANCELLED',
      }[action];
      await recordLog(
        manager,
        incident,
        user.id,
        logAction,
        oldStatus,
        note?.trim() || null,
        { assignmentId: id },
      );
      const recipients = [
        incident.reporterId,
        ...(await managementIds(manager)),
      ];
      if (action === 'cancel') recipients.push(assignment.securityUserId);
      await notify(
        manager,
        recipients,
        incident,
        action === 'complete' ? 'INCIDENT_RESOLVED' : 'ASSIGNMENT_UPDATED',
        `Cập nhật phân công: ${assignment.status}.`,
      );
      return { assignment, incident };
    });
  }
}
