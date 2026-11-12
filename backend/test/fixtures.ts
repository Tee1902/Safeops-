import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../src/auth/decorators/current-user.decorator.js';
import { User, Role } from '../src/database/entities/index.js';
export const testEnvironment = {
  NODE_ENV: 'test',
  PORT: '3000',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USERNAME: 'test',
  DB_PASSWORD: 'test',
  DB_DATABASE: 'safeops_test',
  DB_SYNCHRONIZE: 'false',
  DB_LOGGING: 'false',
  JWT_SECRET: 'test-only-secret-do-not-use-in-production-123456',
  JWT_ISSUER: 'safeops',
  JWT_AUDIENCE: 'safeops-api',
  JWT_ACCESS_TTL_SECONDS: '900',
  JWT_REFRESH_TTL_SECONDS: '604800',
  FRONTEND_URL: 'http://localhost:3001',
  COOKIE_SECURE: 'false',
  TRUST_PROXY_HOPS: '0',
  UPLOAD_DIR: './.test-uploads',
  UPLOAD_MAX_FILE_SIZE: '5242880',
  UPLOAD_MAX_FILES: '10',
  MAIL_HOST: 'localhost',
  MAIL_PORT: '1025',
  MAIL_FROM: 'no-reply@example.com',
  NEXT_PUBLIC_API_URL: 'http://localhost:3000/api',
  NEXT_PUBLIC_WS_URL: 'http://localhost:3000',
  SWAGGER_ENABLED: 'true',
};
export const userId = 'd835b7c5-f14e-431d-994c-909d357a8a41';
export const otherId = 'd835b7c5-f14e-431d-994c-909d357a8a42';
export const sessionId = 'd835b7c5-f14e-431d-994c-909d357a8a43';
export const actor: AuthenticatedUser = {
  id: userId,
  email: 'user@example.com',
  role: 'REPORTER',
  sessionId,
};
export function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: userId,
    fullName: 'Test User',
    email: actor.email,
    roleId: 4,
    role: Object.assign(new Role(), {
      id: 4,
      code: 'REPORTER',
      name: 'Người báo cáo',
    }),
    passwordHash: 'private-hash',
    isActive: true,
    emailVerified: false,
    lastLoginAt: null,
    phone: null,
    avatarUrl: null,
    ...overrides,
  });
}
export function config(overrides: Record<string, unknown> = {}) {
  return new ConfigService({
    ...testEnvironment,
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_REFRESH_TTL_SECONDS: 604800,
    UPLOAD_MAX_FILE_SIZE: 5242880,
    UPLOAD_MAX_FILES: 10,
    ...overrides,
  });
}
export const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=',
  'base64',
);
