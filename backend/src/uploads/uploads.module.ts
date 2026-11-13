import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { UploadedFile } from '../database/entities/uploaded-file.entity.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([UploadedFile]),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: config.getOrThrow<number>('UPLOAD_MAX_FILE_SIZE'),
          files: config.getOrThrow<number>('UPLOAD_MAX_FILES'),
          fields: 0,
        },
      }),
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
