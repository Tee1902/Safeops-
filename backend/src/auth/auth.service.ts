import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities/user.entity.js';
import { Role } from '../database/entities/role.entity.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { SessionService } from './session.service.js';
import { presentUser } from '../users/user.presenter.js';
import { isUniqueViolation } from '../common/database-errors.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    private readonly sessions: SessionService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.userRepository.existsBy({ email }))
      throw new ConflictException('Email đã được sử dụng.');
    const role = await this.roleRepository.findOneBy({ code: 'REPORTER' });
    if (!role)
      throw new NotFoundException(
        'Không tìm thấy vai trò REPORTER. Hãy chạy migration.',
      );
    const user = this.userRepository.create({
      fullName: dto.fullName.trim(),
      email,
      passwordHash: await bcrypt.hash(dto.password, 12),
      phone: dto.phone?.trim() || null,
      roleId: role.id,
      role,
      isActive: true,
      emailVerified: false,
      lastLoginAt: null,
    });
    try {
      return {
        message: 'Đăng ký tài khoản thành công.',
        user: presentUser(await this.userRepository.save(user)),
      };
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Email đã được sử dụng.');
      throw error;
    }
  }

  async validateUser(dto: LoginDto): Promise<User> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.email = :email', { email: dto.email.trim().toLowerCase() })
      .getOne();
    // Hash giả tránh nhánh không tồn tại trả về ngay trước bcrypt.
    const hash =
      user?.passwordHash ??
      '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
    const valid = await bcrypt.compare(dto.password, hash);
    if (!user || !valid || !user.isActive || !user.role) {
      throw new UnauthorizedException(
        'Email hoặc mật khẩu không chính xác hoặc tài khoản đã bị vô hiệu hóa.',
      );
    }
    return user;
  }

  async login(dto: LoginDto) {
    return this.sessions.create(await this.validateUser(dto));
  }

  refresh(token?: string) {
    return this.sessions.refresh(token);
  }
  logout(userId: string, sessionId: string) {
    return this.sessions.revoke(userId, sessionId);
  }
}
