import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1794036197093 implements MigrationInterface {
  name = 'InitialSchema1794036197093';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "full_name" character varying NOT NULL, "email" character varying NOT NULL, "password_hash" text NOT NULL, "phone" character varying, "avatar_url" text, "role_id" integer NOT NULL, "is_active" boolean NOT NULL, "email_verified" boolean NOT NULL, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" SERIAL NOT NULL, "code" character varying(50) NOT NULL, "name" character varying(100) NOT NULL, "description" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_f6d54f95c31b73fb1bdd8e91d0c" UNIQUE ("code"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "incident_types" ("id" SERIAL NOT NULL, "code" character varying NOT NULL, "name" character varying NOT NULL, "description" text, "icon" character varying, "is_active" boolean NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c65ccaa2cc62bdd5d5e0427844d" UNIQUE ("code"), CONSTRAINT "PK_38aaf3180e89906965e94d1021b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "incidents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "description" text, "incident_type_id" integer NOT NULL, "reporter_id" uuid NOT NULL, "verified_by" uuid, "latitude" numeric(10,7) NOT NULL, "longitude" numeric(10,7) NOT NULL, "address" text, "severity" character varying NOT NULL, "status" character varying NOT NULL, "rejection_reason" text, "verified_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resolved_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ccb34c01719889017e2246469f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "incident_attachments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "incident_id" uuid NOT NULL, "uploaded_by" uuid NOT NULL, "file_name" character varying NOT NULL, "file_url" text NOT NULL, "file_type" character varying NOT NULL, "file_size" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c4cdf0dc167f160d5a997fbbbd6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "incident_id" uuid NOT NULL, "security_user_id" uuid NOT NULL, "assigned_by" uuid NOT NULL, "note" text, "status" character varying NOT NULL, "assigned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "accepted_at" TIMESTAMP WITH TIME ZONE, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_c54ca359535e0012b04dcbd80ee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "incident_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "incident_id" uuid NOT NULL, "actor_id" uuid, "action" character varying NOT NULL, "old_status" character varying, "new_status" character varying, "note" text, "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f727a033fe9430876dff0510752" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "incident_id" uuid, "type" character varying NOT NULL, "title" character varying NOT NULL, "message" text NOT NULL, "is_read" boolean NOT NULL, "read_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" ADD CONSTRAINT "FK_a3bfa1c303d5bcc5842c7d8922e" FOREIGN KEY ("incident_type_id") REFERENCES "incident_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" ADD CONSTRAINT "FK_997933e2e9897cd680e453805ca" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" ADD CONSTRAINT "FK_0e277a92df5cc161b47cf2a6a6e" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incident_attachments" ADD CONSTRAINT "FK_83caa236f28b5bdd35322bf4446" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incident_attachments" ADD CONSTRAINT "FK_a972b08d70271cb796a1da67b51" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" ADD CONSTRAINT "FK_704c7ec809134a7176147af8813" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" ADD CONSTRAINT "FK_a38a2b9621ed37b495d905fce86" FOREIGN KEY ("security_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" ADD CONSTRAINT "FK_9791cf4f0e9b9a77ca09f1d4b0f" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incident_logs" ADD CONSTRAINT "FK_93068cc13e2bd3f86b3bf7d823c" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incident_logs" ADD CONSTRAINT "FK_9edf17a697c012180e0c2c55d31" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_1b12943fabc6cb2c1c94379fb51" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_1b12943fabc6cb2c1c94379fb51"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incident_logs" DROP CONSTRAINT "FK_9edf17a697c012180e0c2c55d31"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incident_logs" DROP CONSTRAINT "FK_93068cc13e2bd3f86b3bf7d823c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" DROP CONSTRAINT "FK_9791cf4f0e9b9a77ca09f1d4b0f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" DROP CONSTRAINT "FK_a38a2b9621ed37b495d905fce86"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" DROP CONSTRAINT "FK_704c7ec809134a7176147af8813"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incident_attachments" DROP CONSTRAINT "FK_a972b08d70271cb796a1da67b51"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incident_attachments" DROP CONSTRAINT "FK_83caa236f28b5bdd35322bf4446"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" DROP CONSTRAINT "FK_0e277a92df5cc161b47cf2a6a6e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" DROP CONSTRAINT "FK_997933e2e9897cd680e453805ca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incidents" DROP CONSTRAINT "FK_a3bfa1c303d5bcc5842c7d8922e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TABLE "incident_logs"`);
    await queryRunner.query(`DROP TABLE "assignments"`);
    await queryRunner.query(`DROP TABLE "incident_attachments"`);
    await queryRunner.query(`DROP TABLE "incidents"`);
    await queryRunner.query(`DROP TABLE "incident_types"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
