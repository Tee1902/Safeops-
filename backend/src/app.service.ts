import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}
  async health() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database chưa sẵn sàng.');
    }
    return { status: 'ok' };
  }
}
