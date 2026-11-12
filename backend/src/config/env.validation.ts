import { z } from 'zod';
const booleanString = z.enum(['true', 'false']);
const port = z.coerce.number().int().min(1).max(65535);
const httpUrl = z
  .url()
  .refine((value) => /^https?:\/\//.test(value), 'Phải dùng HTTP/HTTPS');
export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: port.default(3000),
    DB_HOST: z.string().trim().min(1),
    DB_PORT: port,
    DB_USERNAME: z.string().trim().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_DATABASE: z.string().trim().min(1),
    DB_SYNCHRONIZE: booleanString.default('false'),
    DB_LOGGING: booleanString.default('false'),
    JWT_SECRET: z.string().min(32),
    JWT_ISSUER: z.string().trim().min(1).default('safeops'),
    JWT_AUDIENCE: z.string().trim().min(1).default('safeops-api'),
    JWT_ACCESS_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(900)
      .default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3600)
      .max(2592000)
      .default(604800),
    COOKIE_SECURE: booleanString.default('false'),
    FRONTEND_URL: z
      .string()
      .min(1)
      .refine(
        (value) =>
          value.split(',').every((url) => {
            try {
              const parsed = new URL(url.trim());
              return (
                ['http:', 'https:'].includes(parsed.protocol) &&
                parsed.origin === url.trim()
              );
            } catch {
              return false;
            }
          }),
        'FRONTEND_URL phải gồm các origin HTTP/HTTPS ngăn cách bằng dấu phẩy',
      ),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
    UPLOAD_DIR: z.string().trim().min(1),
    UPLOAD_MAX_FILE_SIZE: z.coerce
      .number()
      .int()
      .min(1)
      .max(5 * 1024 * 1024)
      .default(5 * 1024 * 1024),
    UPLOAD_MAX_FILES: z.coerce.number().int().min(1).max(10).default(10),
    MAIL_HOST: z.string().trim().min(1),
    MAIL_PORT: port,
    MAIL_FROM: z.email(),
    MAIL_USER: z.string().default(''),
    MAIL_PASSWORD: z.string().default(''),
    NEXT_PUBLIC_API_URL: httpUrl,
    NEXT_PUBLIC_WS_URL: z
      .url()
      .refine((value) => /^(https?|wss?):\/\//.test(value)),
    SWAGGER_ENABLED: booleanString.default('true'),
  })
  .superRefine((config, ctx) => {
    if (config.NODE_ENV !== 'production') return;
    if (/^(replace-with-|change-me)/i.test(config.JWT_SECRET))
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'Production phải thay JWT_SECRET mẫu bằng bí mật riêng',
      });
    if (config.DB_SYNCHRONIZE === 'true')
      ctx.addIssue({
        code: 'custom',
        path: ['DB_SYNCHRONIZE'],
        message: 'Không được synchronize trong production',
      });
    if (config.COOKIE_SECURE !== 'true')
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'Production phải dùng secure cookie',
      });
    for (const key of [
      'FRONTEND_URL',
      'NEXT_PUBLIC_API_URL',
      'NEXT_PUBLIC_WS_URL',
    ] as const) {
      if (
        config[key]
          .split(',')
          .some((url) => !/^(https|wss):\/\//.test(url.trim()))
      )
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Production phải dùng HTTPS/WSS',
        });
    }
  });
export function validateEnvironment(config: Record<string, unknown>) {
  const result = environmentSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Cấu hình môi trường không hợp lệ:\n${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')}`,
    );
  }
  return result.data;
}
