import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFiles,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiOperation,
  ApiProduces,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ROLE_CODES } from '../auth/roles.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { UploadsService } from './uploads.service.js';

@ApiTags('Uploads')
@ApiBearerAuth()
@Roles(...ROLE_CODES)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(FilesInterceptor('files'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Tải tối đa 10 ảnh, tối đa 5MB/ảnh; kiểm tra magic bytes',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  upload(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.uploads.upload(files, actor.id);
  }

  @Get(':filename')
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiOperation({
    summary: 'Đọc ảnh có xác thực và kiểm tra quyền sở hữu/sự cố',
  })
  async download(
    @Param('filename') filename: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.uploads.authorizedFile(filename, actor);
    response.set({
      'Content-Type': file.mimeType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `inline; filename="${file.filename}"`,
    });
    response.sendFile(
      file.filename,
      { root: this.uploads.root, dotfiles: 'deny' },
      (error) => {
        if (error && !response.headersSent)
          response
            .status(404)
            .json({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Không tìm thấy ảnh.' },
            });
      },
    );
  }
}
