import { validateEnvironment } from './env.validation.js';
import { testEnvironment } from '../../test/fixtures.js';
describe('environment validation', () => {
  it('coerces numeric configuration and keeps boolean strings explicit', () => {
    expect(validateEnvironment(testEnvironment)).toMatchObject({
      DB_PORT: 5432,
      JWT_ACCESS_TTL_SECONDS: 900,
      COOKIE_SECURE: 'false',
    });
  });
  it.each([
    { JWT_SECRET: 'short' },
    { DB_PASSWORD: '' },
    { DB_PORT: 'bad' },
    { JWT_ACCESS_TTL_SECONDS: '3600' },
    { FRONTEND_URL: '*' },
    { UPLOAD_MAX_FILE_SIZE: '5242881' },
    { MAIL_HOST: '' },
    { NEXT_PUBLIC_API_URL: 'javascript:alert(1)' },
  ])('fails early for invalid configuration %j', (changes) => {
    expect(() =>
      validateEnvironment({ ...testEnvironment, ...changes }),
    ).toThrow('Cấu hình môi trường không hợp lệ');
  });
  it('requires HTTPS, secure cookies and migrations in production', () => {
    expect(() =>
      validateEnvironment({
        ...testEnvironment,
        NODE_ENV: 'production',
        DB_SYNCHRONIZE: 'true',
      }),
    ).toThrow('Production');
    expect(() =>
      validateEnvironment({
        ...testEnvironment,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
        FRONTEND_URL: 'https://safeops.example.com',
        NEXT_PUBLIC_API_URL: 'https://safeops.example.com/api',
        NEXT_PUBLIC_WS_URL: 'wss://safeops.example.com',
      }),
    ).not.toThrow();
  });
  it('does not echo secret values in validation errors', () => {
    expect(() =>
      validateEnvironment({
        ...testEnvironment,
        JWT_SECRET: 'private-secret-value',
      }),
    ).not.toThrow(/private-secret-value/);
  });
  it('refuses the sample JWT secret in production', () => {
    expect(() =>
      validateEnvironment({
        ...testEnvironment,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
        FRONTEND_URL: 'https://safeops.example.com',
        NEXT_PUBLIC_API_URL: 'https://safeops.example.com/api',
        NEXT_PUBLIC_WS_URL: 'wss://safeops.example.com',
        JWT_SECRET:
          'replace-with-a-cryptographically-random-secret-at-least-32-characters',
      }),
    ).toThrow('JWT_SECRET');
  });
});
