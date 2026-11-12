import {
  Controller,
  Get,
  Post,
  Param,
  Patch,
  Body,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { PaginationDto } from './dto/pagination.dto.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({
    summary: 'Danh sách người dùng; lọc role và isActive, phân trang',
  })
  findAll(
    @Query() query: ListUsersDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.findAll(query, actor);
  }
  @Post()
  @ApiOperation({ summary: 'Admin tạo tài khoản Operator/Security' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.create(dto, actor.id);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Admin xem hồ sơ theo UUID' })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.users.findOne(id);
  }
  @Patch(':id')
  @ApiOperation({ summary: 'Admin cập nhật hồ sơ' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.update(id, dto, actor.id);
  }
  @Patch(':id/status')
  @ApiOperation({ summary: 'Admin khóa/mở khóa và thu hồi phiên' })
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.updateStatus(id, dto.isActive, actor.id);
  }
  @Patch(':id/role')
  @ApiOperation({
    summary: 'Admin thay role_id, ghi audit log và thu hồi phiên',
  })
  updateRole(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.updateRole(id, dto.roleId, actor.id);
  }
  @Get(':id/audit-logs')
  @ApiOperation({ summary: 'Admin xem lịch sử thay đổi tài khoản' })
  auditLogs(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: PaginationDto,
  ) {
    return this.users.auditLogs(id, query);
  }
}
