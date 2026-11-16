import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from '../database/entities/incident.entity.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  INCIDENT_STATUSES,
  SEVERITIES,
  requireManager,
} from '../common/workflow.js';
import { DashboardQueryDto } from './dashboard-query.dto.js';
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
  async statistics(query: DashboardQueryDto, actor: AuthenticatedUser) {
    requireManager(actor);
    if (query.from && query.to && new Date(query.from) > new Date(query.to))
      throw new BadRequestException('from must be before or equal to to.');
    // All chart series must describe the same snapshot during concurrent writes.
    return this.incidents.manager.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const qb = manager
          .getRepository(Incident)
          .createQueryBuilder('incident');
        if (query.from)
          qb.andWhere('incident.created_at >= :from', {
            from: new Date(query.from).toISOString(),
          });
        if (query.to)
          qb.andWhere('incident.created_at <= :to', {
            to: new Date(query.to).toISOString(),
          });
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
        const aggregate = qb.clone().select('COUNT(*)', 'total');
        for (const status of INCIDENT_STATUSES)
          aggregate.addSelect(
            `COUNT(*) FILTER (WHERE incident.status = '${status}')`,
            `status_${status}`,
          );
        for (const severity of SEVERITIES)
          aggregate.addSelect(
            `COUNT(*) FILTER (WHERE incident.severity = '${severity}')`,
            `severity_${severity}`,
          );
        for (const [name, column] of [
          ['verification', 'verified_at'],
          ['resolution', 'resolved_at'],
        ] as const) {
          aggregate.addSelect(
            `COUNT(*) FILTER (WHERE incident.${column} >= incident.created_at)`,
            `${name}Samples`,
          );
          aggregate.addSelect(
            `AVG(EXTRACT(EPOCH FROM (incident.${column} - incident.created_at))) FILTER (WHERE incident.${column} >= incident.created_at)`,
            `${name}Seconds`,
          );
        }
        const timezone = 'Asia/Saigon';
        const period = `to_char(incident.created_at AT TIME ZONE :timezone, '${query.granularity === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'}')`;
        const raw = await aggregate.getRawOne<Record<string, string | null>>();
        const types = await qb
          .clone()
          .innerJoin('incident.incidentType', 'type')
          .select('type.id', 'id')
          .addSelect('type.code', 'code')
          .addSelect('type.name', 'name')
          .addSelect('COUNT(*)', 'count')
          .groupBy('type.id')
          .addGroupBy('type.code')
          .addGroupBy('type.name')
          .orderBy('type.id', 'ASC')
          .getRawMany<{
            id: number;
            code: string;
            name: string;
            count: string;
          }>();
        const trend = await qb
          .clone()
          .select(period, 'period')
          .addSelect('COUNT(*)', 'count')
          .setParameter('timezone', timezone)
          .groupBy(period)
          .orderBy(period, 'ASC')
          .getRawMany<{ period: string; count: string }>();
        const row = raw ?? {};
        const metric = (name: string) => ({
          samples: Number(row[`${name}Samples`] ?? 0),
          averageSeconds:
            row[`${name}Seconds`] == null
              ? null
              : Number(row[`${name}Seconds`]),
        });
        return {
          timezone,
          granularity: query.granularity,
          total: Number(row.total ?? 0),
          byStatus: Object.fromEntries(
            INCIDENT_STATUSES.map((value) => [
              value,
              Number(row[`status_${value}`] ?? 0),
            ]),
          ),
          bySeverity: Object.fromEntries(
            SEVERITIES.map((value) => [
              value,
              Number(row[`severity_${value}`] ?? 0),
            ]),
          ),
          byType: types.map((item) => ({
            ...item,
            id: Number(item.id),
            count: Number(item.count),
          })),
          trend: trend.map((item) => ({ ...item, count: Number(item.count) })),
          responseTimes: {
            verification: metric('verification'),
            resolution: metric('resolution'),
          },
        };
      },
    );
  }
}
