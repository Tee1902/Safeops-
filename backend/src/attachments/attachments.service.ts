import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  IncidentAttachment,
  UploadedFile,
} from '../database/entities/index.js';
import {
  getIncident,
  isManager,
  paginated,
  recordLog,
  requireIncidentAccess,
  requireStatus,
} from '../common/workflow.js';
import { PaginationDto } from '../users/dto/pagination.dto.js';
import { validateEvidence } from './file-validation.js';
import type { EvidenceFile } from './file-validation.js';
@Injectable()
export class AttachmentsService {
  private readonly root: string;
  private readonly logger = new Logger(AttachmentsService.name);
  constructor(
    private readonly db: DataSource,
    config: ConfigService,
  ) {
    this.root = resolve(
      config.get<string>('UPLOAD_DIR') || join(process.cwd(), 'uploads'),
    );
  }
  private storagePath(key: string) {
    if (!/^[0-9a-f-]{36}\.(png|jpg|webp|pdf)$/.test(key))
      throw new ConflictException('Khóa lưu trữ tệp không hợp lệ.');
    return join(this.root, key);
  }
  private publicItem(item: IncidentAttachment) {
    return {
      id: item.id,
      incidentId: item.incidentId,
      uploadedBy: item.uploadedBy,
      fileName: item.fileName,
      fileType: item.fileType,
      fileSize: item.fileSize,
      createdAt: item.createdAt,
      fileUrl: `/api/attachments/${item.id}/content`,
    };
  }
  async upload(
    incidentId: string,
    user: AuthenticatedUser,
    file?: EvidenceFile,
  ) {
    const info = validateEvidence(file);
    const key = `${randomUUID()}.${info.ext}`;
    const path = this.storagePath(key);
    let written = false;
    try {
      const attachment = await this.db.transaction(async (manager) => {
        const incident = await getIncident(manager, incidentId, true);
        await requireIncidentAccess(manager, incident, user);
        requireStatus(incident.status, [
          'PENDING',
          'VERIFIED',
          'ASSIGNED',
          'IN_PROGRESS',
        ]);
        await mkdir(this.root, { recursive: true });
        const handle = await open(path, 'wx', 0o600);
        // Track creation before writing so a partial write is also cleaned up.
        written = true;
        try {
          await handle.writeFile(file!.buffer);
        } finally {
          await handle.close();
        }
        const repo = manager.getRepository(IncidentAttachment);
        const item = await repo.save(
          repo.create({
            incidentId,
            uploadedBy: user.id,
            fileName: info.name,
            fileUrl: key,
            fileType: info.mime,
            fileSize: String(info.size),
          }),
        );
        await recordLog(
          manager,
          incident,
          user.id,
          'ATTACHMENT_UPLOADED',
          incident.status,
          null,
          { attachmentId: item.id, fileName: item.fileName },
        );
        return item;
      });
      return this.publicItem(attachment);
    } catch (error) {
      if (written)
        await unlink(path).catch((cleanupError) => {
          this.logger.error('Không thể dọn tệp upload thất bại.', cleanupError);
        });
      throw error;
    }
  }
  async list(
    incidentId: string,
    user: AuthenticatedUser,
    query: PaginationDto,
  ) {
    const incident = await getIncident(this.db.manager, incidentId);
    await requireIncidentAccess(this.db.manager, incident, user);
    const { page, limit } = query;
    const [items, total] = await this.db
      .getRepository(IncidentAttachment)
      .findAndCount({
        where: { incidentId },
        order: { createdAt: 'ASC', id: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    return paginated(
      items.map((item) => this.publicItem(item)),
      total,
      page,
      limit,
    );
  }
  async content(id: string, user: AuthenticatedUser) {
    const item = await this.db
      .getRepository(IncidentAttachment)
      .findOneBy({ id });
    if (!item) throw new NotFoundException('Không tìm thấy tệp.');
    const incident = await getIncident(this.db.manager, item.incidentId);
    await requireIncidentAccess(this.db.manager, incident, user);
    try {
      const handle = await open(this.storagePath(item.fileUrl), 'r');
      return new StreamableFile(handle.createReadStream(), {
        type: item.fileType,
        length: Number(item.fileSize),
        disposition: `attachment; filename="evidence"; filename*=UTF-8''${encodeURIComponent(item.fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new NotFoundException('Tệp không còn trong kho lưu trữ.');
      throw error;
    }
  }
  async remove(id: string, user: AuthenticatedUser) {
    let original: string | undefined;
    let tombstone: string | undefined;
    let moved = false;
    try {
      await this.db.transaction(async (manager) => {
        const repo = manager.getRepository(IncidentAttachment);
        const initial = await repo.findOneBy({ id });
        if (!initial) throw new NotFoundException('Không tìm thấy tệp.');
        const incident = await getIncident(manager, initial.incidentId, true);
        await requireIncidentAccess(manager, incident, user);
        const item = await repo.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!item) throw new NotFoundException('Không tìm thấy tệp.');
        if (!isManager(user) && item.uploadedBy !== user.id)
          throw new ForbiddenException(
            'Chỉ người tải lên hoặc quản lý được xóa tệp.',
          );
        requireStatus(incident.status, [
          'PENDING',
          'VERIFIED',
          'ASSIGNED',
          'IN_PROGRESS',
        ]);
        // Serialize deletion with upload claims and remove both metadata records.
        const uploaded = await manager.getRepository(UploadedFile).findOne({
          where: { filename: item.fileUrl },
          lock: { mode: 'pessimistic_write' },
        });
        original = this.storagePath(item.fileUrl);
        tombstone = `${original}.deleted-${randomUUID()}`;
        try {
          await rename(original, tombstone);
          moved = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        await repo.remove(item);
        if (uploaded)
          await manager.getRepository(UploadedFile).remove(uploaded);
        await recordLog(
          manager,
          incident,
          user.id,
          'ATTACHMENT_DELETED',
          incident.status,
          null,
          { attachmentId: id, fileName: item.fileName },
        );
      });
    } catch (error) {
      if (moved)
        await rename(tombstone!, original!).catch((restoreError) => {
          this.logger.error(
            'Không thể khôi phục tệp sau rollback.',
            restoreError,
          );
        });
      throw error;
    }
    if (moved)
      await unlink(tombstone!).catch((error) => {
        this.logger.error('Cần dọn tệp .deleted trong kho lưu trữ.', error);
      });
    return { message: 'Đã xóa bằng chứng.' };
  }
}
