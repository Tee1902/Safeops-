import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Be3NotificationPagination1794510000000 implements MigrationInterface {
  name = 'Be3NotificationPagination1794510000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX "IDX_notifications_user_created_id" ON notifications (user_id, created_at, id)',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_notifications_user_created_id"');
  }
}
