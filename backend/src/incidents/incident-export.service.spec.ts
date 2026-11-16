import {
  IncidentExportService,
  IncidentExportQueryDto,
  spreadsheetText,
} from './incident-export.service.js';
import { IncidentsService } from './incidents.service.js';
import { actor } from '../../test/fixtures.js';

describe('Incident export safeguards', () => {
  it.each(['=SUM(A1:A2)', '+1', '-1', '@lookup', ' \t=1', '\rformula'])(
    'neutralizes spreadsheet text %s',
    (value) => {
      expect(spreadsheetText(value)).toBe(`'${value}`);
    },
  );
  it('preserves ordinary Vietnamese text', () => {
    expect(spreadsheetText('Đám cháy')).toBe('Đám cháy');
  });
  it('requires management rights before reading incidents', async () => {
    const filtered = jest.fn();
    const service = new IncidentExportService({
      filtered,
    } as unknown as IncidentsService);
    await expect(
      service.export(new IncidentExportQueryDto(), actor),
    ).rejects.toMatchObject({ status: 403 });
    expect(filtered).not.toHaveBeenCalled();
  });
  it('rejects oversized exports instead of silently truncating them', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(Array(10001).fill({})),
    };
    const service = new IncidentExportService({
      filtered: () => qb,
    } as unknown as IncidentsService);
    await expect(
      service.export(new IncidentExportQueryDto(), { ...actor, role: 'ADMIN' }),
    ).rejects.toMatchObject({ status: 413 });
    expect(qb.limit).toHaveBeenCalledWith(10001);
  });
});
