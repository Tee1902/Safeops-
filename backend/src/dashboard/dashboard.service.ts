import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from '../database/entities/incident.entity.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { INCIDENT_STATUSES } from '../common/workflow.js';
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Incident)
    private readonly incidents: Repository<Incident>,
  ) {}
  async summary(actor: AuthenticatedUser) {
    if (!['ADMIN', 'OPERATOR'].includes(actor.role))
      throw new ForbiddenException();
    const rows = await this.incidents
      .createQueryBuilder('incident')
      .select('incident.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('incident.status')
      .getRawMany<{ status: string; count: string }>();
    const byStatus = Object.fromEntries(
      INCIDENT_STATUSES.map((status) => [status, 0]),
    );
    for (const row of rows)
      if (row.status in byStatus) byStatus[row.status] = Number(row.count);
    return {
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      byStatus,
    };
  }
}
