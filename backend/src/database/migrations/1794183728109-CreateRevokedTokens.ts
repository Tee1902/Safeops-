import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRevokedTokens1794183728109 implements MigrationInterface {
  name = 'CreateRevokedTokens1794183728109';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "revoked_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_3ff5658edd5d0ab5e8e3a9f55e7" UNIQUE ("token_hash"), CONSTRAINT "PK_5c2b3ed5a8f0e4972e358985038" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_revoked_tokens_expires_at" ON "revoked_tokens"  ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_revoked_tokens_user_id" ON "revoked_tokens"  ("user_id") `,
    );

    await queryRunner.query(
      `ALTER TABLE "revoked_tokens" ADD CONSTRAINT "FK_483872b2fdc8f1ec750c9c7567c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "revoked_tokens" DROP CONSTRAINT "FK_483872b2fdc8f1ec750c9c7567c"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_revoked_tokens_user_id"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_revoked_tokens_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "revoked_tokens"`);
  }
}
