import { Roles } from '../auth/decorators/roles.decorator.js';
import { ApiBearerAuth, ApiTags, ApiBody, ApiConsumes } from '@nestjs/swagger';
import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { PaginationDto } from '../users/dto/pagination.dto.js';
import { AttachmentsService } from './attachments.service.js';
import { MAX_ATTACHMENT_SIZE } from './file-validation.js';
import type { EvidenceFile } from './file-validation.js';
@ApiBearerAuth()
@ApiTags('Attachments')
@Roles('ADMIN', 'OPERATOR', 'SECURITY', 'REPORTER')
@Controller()
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}
  @Post('incidents/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1, fields: 0, parts: 1 },
    }),
  )
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: EvidenceFile,
  ) {
    return this.service.upload(id, user, file);
  }
  @Get('incidents/:id/attachments')
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list(id, user, query);
  }
  @Get('attachments/:id/content')
  content(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.content(id, user);
  }
  @Delete('attachments/:id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.remove(id, user);
  }
}
