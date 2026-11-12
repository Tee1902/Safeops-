import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';
import { TransformInterceptor } from './common/transform.interceptor.js';
import { setupSwagger } from './swagger.js';
import type { Request, Response, NextFunction } from 'express';

export function configureApplication(app: NestExpressApplication) {
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.set(
    'trust proxy',
    config.getOrThrow<number>('TRUST_PROXY_HOPS') || false,
  );
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.use(
    '/api',
    (_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.enableCors({
    origin: config
      .getOrThrow<string>('FRONTEND_URL')
      .split(',')
      .map((url) => url.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new TransformInterceptor(),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  if (config.getOrThrow<string>('SWAGGER_ENABLED') === 'true')
    setupSwagger(app);
}
