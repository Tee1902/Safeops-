import { Repository } from 'typeorm';
import { DashboardService } from './dashboard.service.js';
import { Incident } from '../database/entities/incident.entity.js';
import { actor } from '../../test/fixtures.js';
describe('DashboardService', () => {
  const query = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };
  const service = new DashboardService({
    createQueryBuilder: () => query,
  } as unknown as Repository<Incident>);
  it('aggregates counts without loading reports or private user data', async () => {
    query.getRawMany.mockResolvedValue([
      { status: 'PENDING', count: '3' },
      { status: 'RESOLVED', count: '2' },
    ]);
    await expect(
      service.summary({ ...actor, role: 'OPERATOR' }),
    ).resolves.toMatchObject({
      total: 5,
      byStatus: { PENDING: 3, RESOLVED: 2, CLOSED: 0 },
    });
  });
  it('handles an empty database', async () => {
    query.getRawMany.mockResolvedValue([]);
    await expect(
      service.summary({ ...actor, role: 'ADMIN' }),
    ).resolves.toMatchObject({ total: 0 });
  });
  it.each(['REPORTER', 'SECURITY'] as const)('denies %s', async (role) => {
    await expect(service.summary({ ...actor, role })).rejects.toMatchObject({
      status: 403,
    });
  });
});
