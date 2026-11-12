import 'reflect-metadata';
import 'dotenv/config';

import { DataSource } from 'typeorm';
import { readdir } from 'node:fs/promises';

import { entities } from './entities/all-entities.js';

// Import exact file URLs: glob patterns can misinterpret parentheses in Windows paths.
const migrationDirectory = new URL('./migrations/', import.meta.url);
const migrationExtension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
const migrationModules = await Promise.all(
  (await readdir(migrationDirectory))
    .filter(
      (file) => file.endsWith(migrationExtension) && !file.endsWith('.d.ts'),
    )
    .sort()
    .map((file) => import(new URL(file, migrationDirectory).href)),
);
const migrations = migrationModules.flatMap((module) =>
  Object.values(module).filter((value) => typeof value === 'function'),
);

const AppDataSource = new DataSource({
  type: 'postgres',

  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,

  entities,

  migrations,

  synchronize: false,
  logging: false,
});

export default AppDataSource;
