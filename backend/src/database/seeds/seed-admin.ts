import 'reflect-metadata';

import * as bcrypt from 'bcrypt';

import AppDataSource from '../data-source.js';
import { User } from '../entities/user.entity.js';
import { Role } from '../entities/role.entity.js';

async function seedAdmin() {
  try {
    await AppDataSource.initialize();

    const userRepository = AppDataSource.getRepository(User);
    const roleRepository = AppDataSource.getRepository(Role);

    // Lấy thông tin ADMIN từ biến môi trường.
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    const fullName =
      process.env.ADMIN_FULL_NAME?.trim() || 'System Administrator';

    if (!email || !password) {
      throw new Error(
        'Vui lòng cấu hình ADMIN_EMAIL và ADMIN_PASSWORD trong file .env.',
      );
    }

    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error(
        'Mật khẩu ADMIN phải có ít nhất 12 ký tự và tối đa 72 byte UTF-8.',
      );
    }

    // Tìm vai trò ADMIN.
    const adminRole = await roleRepository.findOneBy({
      code: 'ADMIN',
    });

    if (!adminRole) {
      throw new Error('Không tìm thấy role ADMIN. Hãy chạy seed:roles trước.');
    }

    // Không tạo tài khoản trùng email.
    const existingAdmin = await userRepository.findOneBy({ email });

    if (existingAdmin) {
      if (existingAdmin.roleId !== adminRole.id || !existingAdmin.isActive) {
        console.error(
          'Không thể khởi tạo ADMIN: email đã thuộc tài khoản khác hoặc tài khoản đã bị khóa. Chọn email quản trị riêng.',
        );
        process.exitCode = 1;
        return;
      }
      console.log('Tài khoản ADMIN đã tồn tại. Không tạo thêm.');
      return;
    }

    // Mã hóa mật khẩu.
    const passwordHash = await bcrypt.hash(password, 12);

    const admin = userRepository.create({
      fullName,
      email,
      passwordHash,
      phone: null,
      roleId: adminRole.id,
      isActive: true,
      emailVerified: true,
      lastLoginAt: null,
    });

    await userRepository.save(admin);

    console.log('Tạo tài khoản ADMIN thành công!');
    console.log(`Email: ${email}`);
  } catch {
    console.error(
      'Seed ADMIN thất bại. Kiểm tra cấu hình, migration và kết nối database.',
    );
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void seedAdmin();
