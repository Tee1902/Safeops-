import { AppService } from './app.service.js';
import { DataSource } from 'typeorm';
describe('health', () => {
  it('checks the database before reporting ready', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new AppService({ query } as unknown as DataSource);
    await expect(service.health()).resolves.toEqual({ status: 'ok' });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });
  it('returns 503 when the database is unavailable', async () => {
    const service = new AppService({
      query: jest
        .fn()
        .mockRejectedValue(new Error('private connection string')),
    } as unknown as DataSource);
    await expect(service.health()).rejects.toMatchObject({ status: 503 });
  });
});
