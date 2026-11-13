import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { UploadedFile } from '../database/entities/uploaded-file.entity.js';
import { IncidentAttachment } from '../database/entities/incident-attachment.entity.js';
import { Incident } from '../database/entities/incident.entity.js';
import { Assignment } from '../database/entities/assignment.entity.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Injectable()
export class UploadsService {
  constructor(
    @InjectRepository(UploadedFile)
    private readonly files: Repository<UploadedFile>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}
  get root() {
    return resolve(this.config.getOrThrow<string>('UPLOAD_DIR'));
  }

  async upload(files: Express.Multer.File[] | undefined, ownerId: string) {
    if (!files?.length)
      throw new BadRequestException('Cần ít nhất một ảnh trong trường files.');
    if (files.length > this.config.getOrThrow<number>('UPLOAD_MAX_FILES'))
      throw new BadRequestException('Quá nhiều ảnh.');
    const records: UploadedFile[] = [];
    for (const file of files) {
      if (!file.buffer?.length)
        throw new BadRequestException('Ảnh rỗng hoặc không hợp lệ.');
      if (
        file.buffer.length >
        this.config.getOrThrow<number>('UPLOAD_MAX_FILE_SIZE')
      )
        throw new PayloadTooLargeException('Mỗi ảnh không được vượt quá 5MB.');
      let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
      try {
        detected = await fileTypeFromBuffer(file.buffer);
      } catch {
        throw new BadRequestException('File ảnh bị lỗi.');
      }
      if (
        !detected ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(detected.mime)
      )
        throw new BadRequestException(
          'Chỉ hỗ trợ JPG, PNG hoặc WEBP theo magic bytes.',
        );
      const extension =
        detected.mime === 'image/jpeg'
          ? 'jpg'
          : detected.mime === 'image/png'
            ? 'png'
            : 'webp';
      records.push(
        this.files.create({
          ownerId,
          filename: `${randomUUID()}.${extension}`,
          mimeType: detected.mime,
          size: file.buffer.length,
        }),
      );
    }
    const written: string[] = [];
    try {
      await mkdir(this.root, { recursive: true });
      for (const [index, record] of records.entries()) {
        const path = join(this.root, record.filename);
        await writeFile(path, files[index].buffer, { flag: 'wx', mode: 0o600 });
        written.push(path);
      }
      const saved = await this.files.save(records);
      return {
        urls: saved.map((file) => `/api/uploads/${file.filename}`),
        files: saved.map((file) => ({
          id: file.id,
          url: `/api/uploads/${file.filename}`,
          filename: file.filename,
          mimeType: file.mimeType,
          size: file.size,
        })),
      };
    } catch (error) {
      await Promise.allSettled(written.map((path) => unlink(path)));
      throw error;
    }
  }

  async authorizedFile(filename: string, actor: AuthenticatedUser) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(
        filename,
      )
    )
      throw new NotFoundException('Không tìm thấy ảnh.');
    const file = await this.files.findOneBy({ filename });
    if (!file) throw new NotFoundException('Không tìm thấy ảnh.');
    if (file.ownerId === actor.id || actor.role === 'ADMIN') return file;
    // Người dùng chỉ đọc ảnh đã gắn với sự cố mà họ có quyền truy cập.
    const query = this.dataSource
      .getRepository(IncidentAttachment)
      .createQueryBuilder('attachment')
      .innerJoin(Incident, 'incident', 'incident.id = attachment.incidentId')
      .where('attachment.fileUrl IN (:...keys)', {
        keys: [filename, `/api/uploads/${filename}`],
      });
    if (actor.role === 'REPORTER')
      query.andWhere('incident.reporterId = :userId', { userId: actor.id });
    else if (actor.role === 'SECURITY') {
      query
        .innerJoin(
          Assignment,
          'assignment',
          'assignment.incidentId = incident.id',
        )
        .andWhere(
          'assignment.securityUserId = :userId AND assignment.status != :cancelled',
          { userId: actor.id, cancelled: 'CANCELLED' },
        );
    } else if (actor.role !== 'OPERATOR') throw new ForbiddenException();
    if (!(await query.getExists()))
      throw new NotFoundException('Không tìm thấy ảnh.');
    return file;
  }
}
