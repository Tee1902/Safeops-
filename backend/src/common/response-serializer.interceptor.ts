import {
  ClassSerializerInterceptor,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const PUBLIC_PROJECTION = 'safeops:public-projection';
/** Only for responses that explicitly project every public field. */
export const PublicProjection = () => SetMetadata(PUBLIC_PROJECTION, true);

export class ResponseSerializerInterceptor extends ClassSerializerInterceptor {
  constructor(private readonly projectionReflector: Reflector) {
    super(projectionReflector);
  }
  override async intercept(context: ExecutionContext, next: CallHandler) {
    if (
      this.projectionReflector.getAllAndOverride<boolean>(PUBLIC_PROJECTION, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return next.handle();
    return super.intercept(context, next);
  }
}
