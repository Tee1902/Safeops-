import {
  Catch,
  HttpException,
  Logger,
  type ExceptionFilter,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Request, Response } from 'express';
const codes: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const details =
      exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof details === 'string'
        ? details
        : details && typeof details === 'object' && 'message' in details
          ? details.message
          : 'Lỗi hệ thống.';
    // Không log body/header/token/password hay thông báo SQL chứa dữ liệu người dùng.
    if (status >= 500)
      this.logger.error(`Unhandled error: ${request.method} ${request.path}`);
    if (!response.headersSent)
      response.status(status).json({
        success: false,
        error: {
          code: codes[status] ?? 'INTERNAL_ERROR',
          message: status >= 500 ? 'Lỗi hệ thống.' : message,
        },
        path: request.path,
        timestamp: new Date().toISOString(),
      });
  }
}
