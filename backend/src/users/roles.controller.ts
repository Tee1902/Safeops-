import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Repository, In } from 'typeorm';
import { Role } from '../database/entities/role.entity.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ROLE_CODES } from '../auth/roles.js';
@ApiTags('Users')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('roles')
export class RolesController {
  constructor(
    @InjectRepository(Role) private readonly roles: Repository<Role>,
  ) {}
  @Get()
  @ApiOperation({
    summary: 'Admin lấy danh mục role_id để đổi vai trò người dùng',
  })
  findAll() {
    return this.roles.find({
      where: { code: In([...ROLE_CODES]) },
      order: { id: 'ASC' },
    });
  }
}
