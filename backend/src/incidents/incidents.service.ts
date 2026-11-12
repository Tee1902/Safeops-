import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  Incident,
  IncidentLog,
  IncidentType,
  IncidentAttachment,
  UploadedFile,
  User,
} from '../database/entities/index.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  getIncident,
  isManager,
  managementIds,
  notify,
  paginated,
  recordLog,
  requireIncidentAccess,
  requireManager,
  requireStatus,
} from '../common/workflow.js';
import { CreateIncidentDto } from './dto/create-incident.dto.js';
import { UpdateIncidentDto } from './dto/update-incident.dto.js';
import { IncidentQueryDto } from './dto/incident-query.dto.js';
import { PaginationDto } from '../users/dto/pagination.dto.js';
@Injectable()
export class IncidentsService {
  constructor(private readonly dataSource: DataSource) {}
  private async checkType(
    manager: EntityManager,
    id: number,
    description?: string | null,
  ) {
    const type = await manager
      .getRepository(IncidentType)
      .findOneBy({ id, isActive: true });
    if (!type)
      throw new NotFoundException(
        'Loại sự cố không tồn tại hoặc đã bị vô hiệu hóa.',
      );
    if (type.code === 'OTHER' && !description?.trim())
      throw new BadRequestException('Loại KHÁC cần mô tả cụ thể.');
    return type;
  }
  async create(dto: CreateIncidentDto, reporterId: string) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager
        .getRepository(User)
        .findOneBy({ id: reporterId, isActive: true });
      if (!user) throw new ForbiddenException('Tài khoản không hoạt động.');
      await this.checkType(manager, dto.incidentTypeId, dto.description);
      if (!dto.title.trim())
        throw new BadRequestException('Tiêu đề không được để trống.');
      const repo = manager.getRepository(Incident);
      const incident = await repo.save(
        repo.create({
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          incidentTypeId: dto.incidentTypeId,
          reporterId,
          latitude: dto.latitude.toFixed(7),
          longitude: dto.longitude.toFixed(7),
          address: dto.address?.trim() || null,
          severity: dto.severity,
          status: 'PENDING',
          verifiedBy: null,
          verifiedAt: null,
          rejectionReason: null,
          resolvedAt: null,
        }),
      );
      // Lock uploads in a stable order. A file can belong to only one incident.
      for (const id of [...(dto.attachmentIds ?? [])].sort()) {
        const file = await manager.getRepository(UploadedFile).findOne({
          where: { id, ownerId: reporterId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!file)
          throw new NotFoundException(
            'Ảnh không tồn tại hoặc không thuộc về bạn.',
          );
        const attachments = manager.getRepository(IncidentAttachment);
        if (await attachments.existsBy({ fileUrl: file.filename }))
          throw new BadRequestException('Ảnh đã được gắn vào sự cố khác.');
        await attachments.save(
          attachments.create({
            incidentId: incident.id,
            uploadedBy: reporterId,
            fileName: file.filename,
            fileUrl: file.filename,
            fileType: file.mimeType,
            fileSize: String(file.size),
          }),
        );
      }
      await recordLog(
        manager,
        incident,
        reporterId,
        'CREATED',
        null,
        'Tạo báo cáo sự cố.',
      );
      await notify(
        manager,
        await managementIds(manager),
        incident,
        'INCIDENT_CREATED',
        'Có báo cáo sự cố mới cần xác minh.',
      );
      return incident;
    });
  }
  async findAll(query: IncidentQueryDto, user: AuthenticatedUser) {
    if (query.from && query.to && new Date(query.from) > new Date(query.to))
      throw new BadRequestException('from phải trước hoặc bằng to.');
    const { page, limit } = query;
    const qb = this.dataSource
      .getRepository(Incident)
      .createQueryBuilder('incident')
      .leftJoinAndSelect('incident.incidentType', 'incidentType');
    if (!isManager(user)) {
      if (user.role === 'SECURITY')
        qb.andWhere(
          `(incident.reporter_id = :viewerId OR EXISTS (SELECT 1 FROM assignments a WHERE a.incident_id = incident.id AND a.security_user_id = :viewerId AND a.status IN (:...visibleAssignments)))`,
          {
            viewerId: user.id,
            visibleAssignments: [
              'ASSIGNED',
              'ACCEPTED',
              'IN_PROGRESS',
              'COMPLETED',
            ],
          },
        );
      else
        qb.andWhere('incident.reporter_id = :viewerId', { viewerId: user.id });
    }
    if (query.status)
      qb.andWhere('incident.status = :status', { status: query.status });
    if (query.severity)
      qb.andWhere('incident.severity = :severity', {
        severity: query.severity,
      });
    if (query.incidentTypeId)
      qb.andWhere('incident.incident_type_id = :typeId', {
        typeId: query.incidentTypeId,
      });
    if (query.reporterId)
      qb.andWhere('incident.reporter_id = :reporterId', {
        reporterId: query.reporterId,
      });
    if (query.search)
      qb.andWhere(
        '(incident.title ILIKE :search OR incident.description ILIKE :search OR incident.address ILIKE :search)',
        { search: `%${query.search.replace(/[\\%_]/g, '\\$&')}%` },
      );
    if (query.from)
      qb.andWhere('incident.created_at >= :from', { from: query.from });
    if (query.to) qb.andWhere('incident.created_at <= :to', { to: query.to });
    const [items, total] = await qb
      .orderBy('incident.created_at', 'DESC')
      .addOrderBy('incident.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return paginated(items, total, page, limit);
  }
  async findOne(id: string, user: AuthenticatedUser) {
    const incident = await getIncident(this.dataSource.manager, id);
    await requireIncidentAccess(this.dataSource.manager, incident, user);
    const incidentType = await this.dataSource
      .getRepository(IncidentType)
      .findOneBy({ id: incident.incidentTypeId });
    return Object.assign(incident, { incidentType });
  }
  async update(id: string, dto: UpdateIncidentDto, user: AuthenticatedUser) {
    return this.dataSource.transaction(async (manager) => {
      const incident = await getIncident(manager, id, true);
      if (!isManager(user) && incident.reporterId !== user.id)
        throw new ForbiddenException('Chỉ được sửa báo cáo của bạn.');
      requireStatus(incident.status, ['PENDING']);
      if (!Object.values(dto).some((value) => value !== undefined))
        throw new BadRequestException('Cần ít nhất một trường cập nhật.');
      await this.checkType(
        manager,
        dto.incidentTypeId ?? incident.incidentTypeId,
        dto.description ?? incident.description,
      );
      const changes: Record<string, unknown> = {};
      for (const key of [
        'title',
        'description',
        'address',
        'severity',
      ] as const) {
        if (dto[key] !== undefined) {
          const value = dto[key]!.trim();
          if (key === 'title' && !value)
            throw new BadRequestException('Tiêu đề không được để trống.');
          changes[key] = { old: incident[key], new: value };
          if (key === 'title' || key === 'severity') incident[key] = value;
          else incident[key] = value || null;
        }
      }
      if (dto.incidentTypeId !== undefined) {
        changes.incidentTypeId = {
          old: incident.incidentTypeId,
          new: dto.incidentTypeId,
        };
        incident.incidentTypeId = dto.incidentTypeId;
      }
      if (dto.latitude !== undefined) {
        changes.latitude = { old: incident.latitude, new: dto.latitude };
        incident.latitude = dto.latitude.toFixed(7);
      }
      if (dto.longitude !== undefined) {
        changes.longitude = { old: incident.longitude, new: dto.longitude };
        incident.longitude = dto.longitude.toFixed(7);
      }
      await manager.getRepository(Incident).save(incident);
      await recordLog(
        manager,
        incident,
        user.id,
        'UPDATED',
        incident.status,
        'Cập nhật báo cáo.',
        changes,
      );
      return incident;
    });
  }
  async review(id: string, user: AuthenticatedUser, reason?: string) {
    requireManager(user);
    if (reason !== undefined && !reason.trim())
      throw new BadRequestException('Cần lý do từ chối.');
    return this.dataSource.transaction(async (manager) => {
      const incident = await getIncident(manager, id, true);
      requireStatus(incident.status, ['PENDING']);
      incident.status = reason === undefined ? 'VERIFIED' : 'REJECTED';
      incident.verifiedBy = user.id;
      incident.verifiedAt = new Date();
      incident.rejectionReason = reason?.trim() || null;
      await manager.getRepository(Incident).save(incident);
      await recordLog(
        manager,
        incident,
        user.id,
        incident.status,
        'PENDING',
        incident.rejectionReason,
      );
      await notify(
        manager,
        [incident.reporterId],
        incident,
        `INCIDENT_${incident.status}`,
        reason === undefined
          ? 'Báo cáo đã được xác minh.'
          : `Báo cáo bị từ chối: ${incident.rejectionReason}`,
      );
      return incident;
    });
  }
  async logs(id: string, user: AuthenticatedUser, query: PaginationDto) {
    const incident = await getIncident(this.dataSource.manager, id);
    await requireIncidentAccess(this.dataSource.manager, incident, user);
    const { page, limit } = query;
    const [items, total] = await this.dataSource
      .getRepository(IncidentLog)
      .findAndCount({
        where: { incidentId: id },
        order: { createdAt: 'ASC', id: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    return paginated(items, total, page, limit);
  }
  async close(id: string, user: AuthenticatedUser, note?: string) {
    requireManager(user);
    return this.dataSource.transaction(async (manager) => {
      const incident = await getIncident(manager, id, true);
      requireStatus(incident.status, ['RESOLVED']);
      incident.status = 'CLOSED';
      await manager.getRepository(Incident).save(incident);
      await recordLog(
        manager,
        incident,
        user.id,
        'CLOSED',
        'RESOLVED',
        note?.trim() || null,
      );
      await notify(
        manager,
        [incident.reporterId],
        incident,
        'INCIDENT_CLOSED',
        'Sự cố đã được đóng.',
      );
      return incident;
    });
  }
}
