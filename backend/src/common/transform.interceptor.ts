import {
  Injectable,
  StreamableFile,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { map } from 'rxjs';
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next
      .handle()
      .pipe(
        map((data: unknown) =>
          data instanceof StreamableFile ? data : { success: true, data },
        ),
      );
  }
}
