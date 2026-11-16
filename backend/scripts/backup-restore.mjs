import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const within = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
async function files(root, prefix = '') {
  const output = [];
  for (const entry of await readdir(join(root, prefix), {
    withFileTypes: true,
  })) {
    const name = join(prefix, entry.name);
    if (entry.isSymbolicLink())
      throw new Error('Symbolic links are not supported in backups.');
    if (entry.isDirectory()) output.push(...(await files(root, name)));
    else if (entry.isFile()) output.push(name);
    else throw new Error('Only regular files and directories are supported.');
  }
  return output.sort();
}
async function checksum(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
function postgres(options) {
  const env = {
    ...process.env,
    PGPASSWORD: process.env.DB_PASSWORD ?? '',
    PGUSER: process.env.DB_USERNAME,
    PGDATABASE: options.database ?? process.env.DB_DATABASE,
    PGHOST: options.container
      ? '127.0.0.1'
      : (process.env.DB_HOST ?? '127.0.0.1'),
    PGPORT: options.container ? '5432' : (process.env.DB_PORT ?? '5432'),
  };
  if (!env.PGUSER || !env.PGDATABASE)
    throw new Error('Set DB_USERNAME and DB_DATABASE (or --database).');
  return async (tool, args, { input, output, capture = false } = {}) => {
    const command = options.container ? 'docker' : tool;
    const argv = options.container
      ? [
          'exec',
          '-i',
          ...['PGPASSWORD', 'PGUSER', 'PGDATABASE', 'PGHOST', 'PGPORT'].flatMap(
            (key) => ['--env', key],
          ),
          options.container,
          tool,
          ...args,
        ]
      : args;
    const child = spawn(command, argv, {
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Database/client errors can contain connection data. Keep them out of logs.
    child.stderr.resume();
    const done = new Promise((accept, reject) => {
      child.on('error', () =>
        reject(
          new Error(
            `Cannot start ${tool}. Install PostgreSQL client tools or use --container.`,
          ),
        ),
      );
      child.on('close', (code) =>
        code === 0
          ? accept()
          : reject(
              new Error(
                `${tool} failed (exit ${code}); backup/restore is incomplete.`,
              ),
            ),
      );
    });
    let result = '';
    const receive = output
      ? pipeline(
          child.stdout,
          createWriteStream(output, { flags: 'wx', mode: 0o600 }),
        )
      : (async () => {
          for await (const chunk of child.stdout)
            if (capture) result += chunk.toString();
        })();
    const send = input
      ? pipeline(createReadStream(input), child.stdin)
      : (child.stdin.end(), Promise.resolve());
    await Promise.all([done, receive, send]);
    return result.trim();
  };
}

export async function verifyBackup(directory) {
  const root = resolve(directory);
  if ((await lstat(root)).isSymbolicLink())
    throw new Error('Backup root must not be a symbolic link.');
  if ((await lstat(join(root, 'manifest.json'))).isSymbolicLink())
    throw new Error('Backup manifest must not be a symbolic link.');
  const manifest = JSON.parse(
    await readFile(join(root, 'manifest.json'), 'utf8'),
  );
  if (manifest.version !== 1 || !Array.isArray(manifest.files))
    throw new Error('Unsupported backup manifest.');
  const names = new Set();
  for (const file of manifest.files) {
    if (
      typeof file.path !== 'string' ||
      isAbsolute(file.path) ||
      file.path.includes('\\') ||
      file.path
        .split('/')
        .some((part) => !part || part === '..' || part === '.')
    )
      throw new Error('Invalid backup path.');
    const path = resolve(root, file.path);
    if (
      !within(root, path) ||
      names.has(file.path) ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw new Error('Invalid backup manifest entry.');
    names.add(file.path);
    // Check every ancestor to prevent symlink traversal, including uploads root.
    let ancestor = path;
    while (ancestor !== root) {
      if ((await lstat(ancestor)).isSymbolicLink())
        throw new Error('Symbolic link in backup.');
      ancestor = dirname(ancestor);
    }
    if (
      !(await stat(path)).isFile() ||
      (await stat(path)).size !== file.size ||
      (await checksum(path)) !== file.sha256
    )
      throw new Error(`Backup checksum mismatch: ${file.path}`);
  }
  const actual = (await files(root))
    .filter((name) => name !== 'manifest.json')
    .map((name) => name.replaceAll('\\', '/'));
  if (
    !names.has('database.dump') ||
    actual.length !== names.size ||
    actual.some((name) => !names.has(name))
  )
    throw new Error('Backup file inventory mismatch.');
  if (
    [...names].some(
      (name) => name !== 'database.dump' && !name.startsWith('uploads/'),
    )
  )
    throw new Error('Unexpected backup files.');
  return manifest;
}

export async function runBackupRestore(args = process.argv.slice(2)) {
  const { positionals, values: options } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      output: { type: 'string' },
      input: { type: 'string' },
      uploads: { type: 'string' },
      database: { type: 'string' },
      container: { type: 'string' },
      'writers-stopped': { type: 'boolean' },
    },
  });
  const [action] = positionals;
  if (action === 'verify') {
    await verifyBackup(options.input);
    console.log('Backup checksums and file inventory verified.');
    return;
  }
  if (
    !['backup', 'restore'].includes(action) ||
    !options.uploads ||
    !options['writers-stopped']
  )
    throw new Error(
      'Usage: backup --output DIR --uploads DIR --writers-stopped, restore --input DIR --uploads EMPTY_DIR --database NAME_restore --writers-stopped, or verify --input DIR. Optional: --container NAME. Stop ALL application writers before backup/restore.',
    );
  const uploads = resolve(options.uploads);
  const pg = postgres(options);
  if (action === 'backup') {
    if (!options.output) throw new Error('--output is required.');
    const output = resolve(options.output);
    if (within(uploads, output) || within(output, uploads))
      throw new Error('Backup and uploads paths must be separate.');
    if (await exists(output))
      throw new Error('Backup output already exists; choose a new directory.');
    if ((await lstat(uploads)).isSymbolicLink())
      throw new Error('Uploads root must not be a symbolic link.');
    const uploadFiles = await files(uploads);
    const pending = output + '.incomplete';
    await mkdir(dirname(output), { recursive: true, mode: 0o700 });
    await mkdir(pending, { mode: 0o700 });
    await mkdir(join(pending, 'uploads'), { mode: 0o700 });
    await pg('pg_dump', ['--format=custom', '--no-owner', '--no-acl'], {
      output: join(pending, 'database.dump'),
    });
    for (const file of uploadFiles) {
      await mkdir(dirname(join(pending, 'uploads', file)), {
        recursive: true,
        mode: 0o700,
      });
      await copyFile(join(uploads, file), join(pending, 'uploads', file));
      await chmod(join(pending, 'uploads', file), 0o600);
    }
    const inventory = [];
    for (const file of await files(pending))
      inventory.push({
        path: file.replaceAll('\\', '/'),
        size: (await stat(join(pending, file))).size,
        sha256: await checksum(join(pending, file)),
      });
    await writeFile(
      join(pending, 'manifest.json'),
      JSON.stringify(
        {
          version: 1,
          createdAt: new Date().toISOString(),
          writersStopped: true,
          files: inventory,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    await verifyBackup(pending);
    await rename(pending, output);
    console.log('Backup completed and verified.');
  } else {
    const target = options.database ?? process.env.DB_DATABASE;
    if (
      !target ||
      target.length > 63 ||
      !/^[A-Za-z_][A-Za-z0-9_]*_(restore|test)$/.test(target)
    )
      throw new Error(
        'Restore requires a separate database ending in _restore or _test.',
      );
    if (!options.input) throw new Error('--input is required.');
    const input = resolve(options.input);
    if (within(uploads, input) || within(input, uploads))
      throw new Error('Restore uploads and backup paths must be separate.');
    const manifest = await verifyBackup(input);
    if (await exists(uploads)) {
      if (
        (await lstat(uploads)).isSymbolicLink() ||
        (await readdir(uploads)).length
      )
        throw new Error('Restore upload directory must be empty.');
    }
    const tableCount = await pg(
      'psql',
      [
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-Atc',
        "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','f')",
      ],
      { capture: true },
    );
    if (tableCount !== '0')
      throw new Error(
        'Restore target database is not empty. No data was replaced.',
      );
    await mkdir(uploads, { recursive: true, mode: 0o700 });
    await pg(
      'pg_restore',
      [
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
        '--single-transaction',
        '--dbname',
        target,
      ],
      { input: join(input, 'database.dump') },
    );
    for (const file of manifest.files.filter((entry) =>
      entry.path.startsWith('uploads/'),
    )) {
      const name = file.path.slice('uploads/'.length);
      await mkdir(dirname(join(uploads, name)), {
        recursive: true,
        mode: 0o700,
      });
      await copyFile(join(input, file.path), join(uploads, name));
      await chmod(join(uploads, name), 0o600);
      if ((await checksum(join(uploads, name))) !== file.sha256)
        throw new Error(
          'Restored upload checksum mismatch. Keep writers stopped.',
        );
    }
    console.log(
      'Restore completed; upload checksums verified. Check application data before enabling writers.',
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  runBackupRestore().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
