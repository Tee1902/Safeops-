import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { InitialSchema1794036197093 } from '../src/database/migrations/1794036197093-InitialSchema.js';
import { CreateRevokedTokens1794183728109 } from '../src/database/migrations/1794183728109-CreateRevokedTokens.js';
import { WorkflowIndexes1794211200000 } from '../src/database/migrations/1794211200000-WorkflowIndexes.js';
import { UserTokenVersion1794220000000 } from '../src/database/migrations/1794220000000-UserTokenVersion.js';
import { Be1Foundation1794300000000 } from '../src/database/migrations/1794300000000-Be1Foundation.js';

describe('Upgrade from the existing database', () => {
  let control: DataSource;
  let db: DataSource;
  let schema: string;
  beforeEach(async () => {
    const url =
      process.env.TEST_DATABASE_URL ||
      'postgres://safeops_test:safeops_test_only@127.0.0.1:55432/safeops_test';
    if (!new URL(url).pathname.endsWith('_test'))
      throw new Error('Only a _test database is allowed.');
    schema = `upgrade_test_${randomUUID().replaceAll('-', '')}`;
    control = await new DataSource({
      type: 'postgres',
      url,
      connectTimeoutMS: 5000,
    }).initialize();
    await control.query(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
    );
    await control.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({
      type: 'postgres',
      url,
      schema,
      extra: { options: `-c search_path=${schema},public` },
      migrations: [
        InitialSchema1794036197093,
        CreateRevokedTokens1794183728109,
        WorkflowIndexes1794211200000,
        UserTokenVersion1794220000000,
      ],
    }).initialize();
    await db.runMigrations();
    db.setOptions({
      migrations: [
        ...db.migrations.map((m) => m.constructor),
        Be1Foundation1794300000000,
      ],
    });
    await db.destroy();
    await db.initialize();
  });
  afterEach(async () => {
    if (db?.isInitialized) await db.destroy();
    if (control?.isInitialized) {
      await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await control.destroy();
    }
  });
  async function legacyUser(email = ' OLD@EXAMPLE.COM ') {
    const [role] = await db.query(
      "INSERT INTO roles(code,name) VALUES ('MANAGER','Custom manager') RETURNING id",
    );
    const [user] = await db.query(
      `INSERT INTO users(full_name,email,password_hash,role_id,is_active,email_verified)
      VALUES ('Existing User',$1,'unchanged-hash',$2,true,false) RETURNING id`,
      [email, role.id],
    );
    return { userId: user.id, roleId: role.id };
  }
  it('preserves user and role IDs, password hashes, and normalizes email', async () => {
    const old = await legacyUser();
    await db.runMigrations();
    const [user] = await db.query(
      'SELECT id,email,password_hash,role_id,token_version FROM users WHERE id=$1',
      [old.userId],
    );
    expect(user).toMatchObject({
      id: old.userId,
      email: 'old@example.com',
      password_hash: 'unchanged-hash',
      role_id: old.roleId,
      token_version: 0,
    });
    expect(
      await db.query('SELECT code FROM roles WHERE id=$1', [old.roleId]),
    ).toEqual([{ code: 'OPERATOR' }]);
    expect(
      await db.query('SELECT count(*)::int AS count FROM migrations'),
    ).toEqual([{ count: 5 }]);
    expect(await db.runMigrations()).toEqual([]);
  });
  it('merges legacy Manager users into an already existing Operator role', async () => {
    const old = await legacyUser();
    const [operator] = await db.query(
      "INSERT INTO roles(code,name) VALUES ('OPERATOR','Custom operator') RETURNING id",
    );
    await db.runMigrations();
    expect(
      await db.query('SELECT role_id FROM users WHERE id=$1', [old.userId]),
    ).toEqual([{ role_id: operator.id }]);
    expect(
      await db.query("SELECT name FROM roles WHERE code='OPERATOR'"),
    ).toEqual([{ name: 'Custom operator' }]);
    expect(await db.query("SELECT id FROM roles WHERE code='MANAGER'")).toEqual(
      [],
    );
  });
  it('rolls back the entire upgrade when legacy emails collide after normalization', async () => {
    const old = await legacyUser('duplicate@example.com');
    await db.query(
      `INSERT INTO users(full_name,email,password_hash,role_id,is_active,email_verified)
      VALUES ('Another User',' DUPLICATE@example.com ','another-hash',$1,true,false)`,
      [old.roleId],
    );
    await expect(db.runMigrations()).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
    expect(
      await db.query('SELECT code FROM roles WHERE id=$1', [old.roleId]),
    ).toEqual([{ code: 'MANAGER' }]);
    expect(await db.query('SELECT count(*)::int AS count FROM users')).toEqual([
      { count: 2 },
    ]);
    expect(
      await db.query('SELECT count(*)::int AS count FROM migrations'),
    ).toEqual([{ count: 4 }]);
    expect(
      await db.query('SELECT to_regclass($1) AS table_name', [
        `${schema}.auth_sessions`,
      ]),
    ).toEqual([{ table_name: null }]);
  });
  it('can revert and reapply the foundation without deleting existing users', async () => {
    const old = await legacyUser();
    await db.runMigrations();
    await db.undoLastMigration();
    expect(
      await db.query('SELECT role_id FROM users WHERE id=$1', [old.userId]),
    ).toEqual([{ role_id: old.roleId }]);
    expect(
      await db.query('SELECT code FROM roles WHERE id=$1', [old.roleId]),
    ).toEqual([{ code: 'MANAGER' }]);
    await db.runMigrations();
    expect(
      await db.query('SELECT code FROM roles WHERE id=$1', [old.roleId]),
    ).toEqual([{ code: 'OPERATOR' }]);
  });
});
