import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { InjectionToken } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { configureApplication } from '../src/setup-app.js';
import { testEnvironment } from './fixtures.js';

// Dùng cho HTTP contract tests và export OpenAPI; không mở kết nối DB.
export async function createTestApplication(
  overrides: { token: InjectionToken; value: unknown }[] = [],
) {
  Object.assign(process.env, testEnvironment);
  const { AppModule } = await import('../src/app.module.js');
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataSource)
    .useValue({
      options: { type: 'postgres' },
      entityMetadatas: [],
      isInitialized: false,
      getRepository: () => ({}),
      query: async () => [{ '?column?': 1 }],
    });
  for (const override of overrides)
    builder.overrideProvider(override.token).useValue(override.value);
  const module = await builder.compile();
  const app = module.createNestApplication<NestExpressApplication>();
  configureApplication(app);
  await app.init();
  return { app, module };
}
