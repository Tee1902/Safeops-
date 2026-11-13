import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Be3IncidentPagination1794510100000 implements MigrationInterface {
  name = 'Be3IncidentPagination1794510100000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX "IDX_incidents_created_id" ON incidents (created_at, id)',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_incidents_created_id"');
  }
}
