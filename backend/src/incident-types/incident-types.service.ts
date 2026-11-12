import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { IncidentType } from '../database/entities/index.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { paginated } from '../common/workflow.js';
import {
  CreateIncidentTypeDto,
  IncidentTypeQueryDto,
  UpdateIncidentTypeDto,
} from './incident-types.dto.js';
@Injectable()
export class IncidentTypesService {
  constructor(private readonly db: DataSource) {}
  async list(query: IncidentTypeQueryDto, user: AuthenticatedUser) {
    if (query.includeInactive === 'true' && user.role !== 'ADMIN')
      throw new ForbiddenException('Chỉ ADMIN xem loại đã vô hiệu hóa.');
    const { page, limit } = query;
    const [items, total] = await this.db
      .getRepository(IncidentType)
      .findAndCount({
        where: query.includeInactive === 'true' ? {} : { isActive: true },
        order: { id: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    return paginated(items, total, page, limit);
  }
  async save(dto: CreateIncidentTypeDto | UpdateIncidentTypeDto, id?: number) {
    try {
      return await this.db.transaction(async (manager) => {
        const repo = manager.getRepository(IncidentType);
        const item =
          id === undefined
            ? repo.create({ description: null, icon: null, isActive: true })
            : await repo.findOne({
                where: { id },
                lock: { mode: 'pessimistic_write' },
              });
        if (!item) throw new NotFoundException('Không tìm thấy loại sự cố.');
        if (
          id !== undefined &&
          item.code === 'OTHER' &&
          dto.code !== undefined &&
          dto.code !== 'OTHER'
        )
          throw new ConflictException('Không đổi mã loại OTHER.');
        const fields = Object.fromEntries(
          Object.entries(dto).filter(([, value]) => value !== undefined),
        );
        if (!Object.keys(fields).length)
          throw new BadRequestException('Cần ít nhất một trường cập nhật.');
        Object.assign(item, fields);
        return repo.save(item);
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException('Mã loại sự cố đã tồn tại.');
      throw error;
    }
  }
}
