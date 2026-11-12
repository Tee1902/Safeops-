import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../database/entities/user.entity.js';
import { Role } from '../database/entities/role.entity.js';

import { AuthModule } from '../auth/auth.module.js';

import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { ProfileController } from './profile.controller.js';
import { RolesController } from './roles.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role]), AuthModule],
  providers: [UsersService],
  exports: [UsersService],
  controllers: [RolesController, ProfileController, UsersController],
})
export class UsersModule {}
