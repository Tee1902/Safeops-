import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator.js';
import { AppService } from './app.service.js';
@ApiTags('Health')
@Public()
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}
  @Get()
  @ApiOperation({ summary: 'Readiness check của API và PostgreSQL' })
  health() {
    return this.appService.health();
  }
}
