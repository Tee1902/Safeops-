import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Be1Foundation1794300000000 implements MigrationInterface {
  name = 'Be1Foundation1794300000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE roles SET code = 'OPERATOR', name = 'Điều phối viên' WHERE code = 'MANAGER' AND NOT EXISTS (SELECT 1 FROM roles WHERE code = 'OPERATOR')`,
    );
    await queryRunner.query(
      `UPDATE users SET role_id = (SELECT id FROM roles WHERE code = 'OPERATOR') WHERE role_id IN (SELECT id FROM roles WHERE code = 'MANAGER')`,
    );
    await queryRunner.query(`DELETE FROM roles WHERE code = 'MANAGER'`);
    await queryRunner.query(
      `INSERT INTO roles (code, name) VALUES ('ADMIN', 'Quản trị viên'), ('OPERATOR', 'Điều phối viên'), ('SECURITY', 'Nhân viên an ninh'), ('REPORTER', 'Người báo cáo') ON CONFLICT (code) DO NOTHING`,
    );
    // Dừng khi dữ liệu cũ có email trùng sau chuẩn hóa, tránh gộp tài khoản.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_email_normalized" ON users (lower(trim(email)))`,
    );
    await queryRunner.query(`UPDATE users SET email = lower(trim(email))`);
    await queryRunner.query(`CREATE TABLE auth_sessions (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash varchar(64) NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_sessions_user_id" ON auth_sessions (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_sessions_expires_at" ON auth_sessions (expires_at)`,
    );
    await queryRunner.query(`CREATE TABLE user_audit_logs (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), actor_id uuid NOT NULL REFERENCES users(id),
      target_user_id uuid NOT NULL REFERENCES users(id), action varchar(50) NOT NULL,
      changes jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_audit_target_created" ON user_audit_logs (target_user_id, created_at)`,
    );
    await queryRunner.query(`CREATE TABLE uploaded_files (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), owner_id uuid NOT NULL REFERENCES users(id),
      filename varchar(50) NOT NULL UNIQUE, mime_type varchar(30) NOT NULL,
      size integer NOT NULL CHECK (size > 0 AND size <= 5242880), created_at timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(
      `CREATE INDEX "IDX_uploaded_files_owner_id" ON uploaded_files (owner_id)`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE uploaded_files`);
    await queryRunner.query(`DROP TABLE user_audit_logs`);
    await queryRunner.query(`DROP TABLE auth_sessions`);
    await queryRunner.query(`DROP INDEX "UQ_users_email_normalized"`);
    await queryRunner.query(
      `UPDATE roles SET code = 'MANAGER', name = 'Quản lý' WHERE code = 'OPERATOR'`,
    );
  }
}
