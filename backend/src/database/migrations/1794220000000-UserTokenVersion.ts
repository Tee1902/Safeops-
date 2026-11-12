import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserTokenVersion1794220000000 implements MigrationInterface {
  name = 'UserTokenVersion1794220000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ADD "token_version" integer NOT NULL DEFAULT 0',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "token_version"');
  }
}
