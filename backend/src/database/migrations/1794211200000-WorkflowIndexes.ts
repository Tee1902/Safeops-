import type { MigrationInterface, QueryRunner } from 'typeorm';
export class WorkflowIndexes1794211200000 implements MigrationInterface {
  name = 'WorkflowIndexes1794211200000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_assignments_one_active" ON "assignments" ("incident_id") WHERE "status" IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_incidents_reporter_created" ON "incidents" ("reporter_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_assignments_security_status" ON "assignments" ("security_user_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_read" ON "notifications" ("user_id", "is_read")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_incident_logs_incident_created" ON "incident_logs" ("incident_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attachments_incident" ON "incident_attachments" ("incident_id")`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of [
      'IDX_attachments_incident',
      'IDX_incident_logs_incident_created',
      'IDX_notifications_user_read',
      'IDX_assignments_security_status',
      'IDX_incidents_reporter_created',
      'IDX_assignments_one_active',
    ]) {
      await queryRunner.query(`DROP INDEX "${name}"`);
    }
  }
}
