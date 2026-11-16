import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { DataSource } from 'typeorm';
import { verifyBackup } from '../scripts/backup-restore.mjs';

test(
  'backup and restore real application schema, database records and binary uploads',
  { timeout: 120000 },
  async (t) => {
    const url = new URL(
      process.env.TEST_DATABASE_URL ||
        'postgres://safeops_test:safeops_test_only@127.0.0.1:55432/safeops_test',
    );
    assert.match(url.pathname, /_test$/);
    const control = new pg.Client({ connectionString: url.href });
    const sourceName = `backup_${randomUUID().replaceAll('-', '')}_test`;
    const targetName = `${sourceName}_restore`;
    const root = await mkdtemp(join(tmpdir(), 'safeops-backup-'));
    const uploads = join(root, 'original');
    const restoredUploads = join(root, 'restored');
    const backup = join(root, 'backups', 'snapshot');
    const sourceUrl = new URL(url);
    sourceUrl.pathname = `/${sourceName}`;
    const targetUrl = new URL(url);
    targetUrl.pathname = `/${targetName}`;
    let source;
    let restored;
    let db;
    await control.connect();
    try {
      await control.query(`CREATE DATABASE "${sourceName}"`);
      await control.query(`CREATE DATABASE "${targetName}"`);
      source = new pg.Client({ connectionString: sourceUrl.href });
      await source.connect();
      await source.query(
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
      );
      const { default: template } =
        await import('../.test-dist/src/database/data-source.js');
      db = await new DataSource({
        type: 'postgres',
        url: sourceUrl.href,
        migrations: template.options.migrations,
      }).initialize();
      await db.runMigrations();
      const {
        rows: [user],
      } = await source.query(
        "INSERT INTO users(full_name,email,password_hash,role_id,is_active,email_verified) SELECT 'Người dùng','restore@example.com','hash',id,true,false FROM roles WHERE code='REPORTER' RETURNING id",
      );
      const {
        rows: [type],
      } = await source.query(
        "INSERT INTO incident_types(code,name,is_active) VALUES('FIRE','Cháy',true) RETURNING id",
      );
      const {
        rows: [incident],
      } = await source.query(
        "INSERT INTO incidents(title,reporter_id,incident_type_id,latitude,longitude,severity,status) VALUES('Đám cháy',$1,$2,10.7,106.6,'HIGH','PENDING') RETURNING id",
        [user.id, type.id],
      );
      const filename = `${randomUUID()}.png`;
      const bytes = Buffer.from([0, 255, 1, 2, 128, 13, 10, 0]);
      await source.query(
        'INSERT INTO uploaded_files(owner_id,filename,mime_type,size) VALUES($1,$2,$3,$4)',
        [user.id, filename, 'image/png', bytes.length],
      );
      await mkdir(uploads);
      await writeFile(join(uploads, filename), bytes);
      await mkdir(join(uploads, 'thư mục'));
      await writeFile(
        join(uploads, 'thư mục', 'ghi chú.txt'),
        'Bằng chứng tiếng Việt',
      );
      const env = {
        ...process.env,
        DB_HOST: url.hostname,
        DB_PORT: url.port || '5432',
        DB_USERNAME: decodeURIComponent(url.username),
        DB_PASSWORD: decodeURIComponent(url.password),
        DB_DATABASE: sourceName,
      };
      const container = process.env.TEST_POSTGRES_CONTAINER
        ? ['--container', process.env.TEST_POSTGRES_CONTAINER]
        : [];
      const run = (args) =>
        promisify(execFile)(
          process.execPath,
          ['scripts/backup-restore.mjs', ...args, ...container],
          { env, windowsHide: true },
        );
      await t.test(
        'rejects backup while writers have not been stopped',
        async () => {
          await assert.rejects(
            run(['backup', '--output', backup, '--uploads', uploads]),
            /Stop ALL application writers/,
          );
        },
      );
      await run([
        'backup',
        '--output',
        backup,
        '--uploads',
        uploads,
        '--writers-stopped',
      ]);
      const manifest = await verifyBackup(backup);
      assert.equal(manifest.files.length, 3);
      await t.test('refuses to overwrite an existing backup', async () => {
        await assert.rejects(
          run([
            'backup',
            '--output',
            backup,
            '--uploads',
            uploads,
            '--writers-stopped',
          ]),
          /already exists/,
        );
      });
      await run([
        'restore',
        '--input',
        backup,
        '--uploads',
        restoredUploads,
        '--database',
        targetName,
        '--writers-stopped',
      ]);
      restored = new pg.Client({ connectionString: targetUrl.href });
      await restored.connect();
      assert.equal(
        (
          await restored.query('SELECT title FROM incidents WHERE id=$1', [
            incident.id,
          ])
        ).rows[0].title,
        'Đám cháy',
      );
      assert.equal(
        (
          await restored.query(
            'SELECT filename FROM uploaded_files WHERE owner_id=$1',
            [user.id],
          )
        ).rows[0].filename,
        filename,
      );
      assert.equal(
        (await restored.query('SELECT count(*) FROM migrations')).rows[0].count,
        String(db.migrations.length),
      );
      assert.equal(
        (await restored.query("SELECT safeops_fold('ĐÁM CHÁY') AS text"))
          .rows[0].text,
        'dam chay',
      );
      assert.deepEqual(await readFile(join(restoredUploads, filename)), bytes);
      assert.equal(
        await readFile(join(restoredUploads, 'thư mục', 'ghi chú.txt'), 'utf8'),
        'Bằng chứng tiếng Việt',
      );
      await t.test(
        'rejects restoring into a nonempty database or upload directory',
        async () => {
          await assert.rejects(
            run([
              'restore',
              '--input',
              backup,
              '--uploads',
              join(root, 'unused'),
              '--database',
              targetName,
              '--writers-stopped',
            ]),
            /not empty/,
          );
          await assert.rejects(
            run([
              'restore',
              '--input',
              backup,
              '--uploads',
              restoredUploads,
              '--database',
              targetName,
              '--writers-stopped',
            ]),
            /directory must be empty/,
          );
        },
      );
      await t.test('rejects unsafe target names', async () => {
        await assert.rejects(
          run([
            'restore',
            '--input',
            backup,
            '--uploads',
            join(root, 'unused'),
            '--database',
            'safeops',
            '--writers-stopped',
          ]),
          /separate database/,
        );
      });
      await t.test('detects modified upload bytes before restore', async () => {
        await writeFile(join(backup, 'uploads', filename), 'tampered');
        await assert.rejects(verifyBackup(backup), /checksum mismatch/);
      });
    } finally {
      if (db?.isInitialized) await db.destroy();
      await source?.end();
      await restored?.end();
      await control.query(
        `DROP DATABASE IF EXISTS "${sourceName}" WITH (FORCE)`,
      );
      await control.query(
        `DROP DATABASE IF EXISTS "${targetName}" WITH (FORCE)`,
      );
      await control.end();
      await rm(root, { recursive: true, force: true });
    }
  },
);
