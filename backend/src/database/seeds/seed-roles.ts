import 'reflect-metadata';

import AppDataSource from '../data-source.js';
import { Role } from '../entities/role.entity.js';

const roles = [
  {
    code: 'ADMIN',
    name: 'Quản trị viên',
    description: 'Quản lý toàn bộ hệ thống SafeOps.',
  },
  {
    code: 'OPERATOR',
    name: 'Điều phối viên',
    description: 'Quản lý và giám sát hoạt động xử lý sự cố.',
  },
  {
    code: 'REPORTER',
    name: 'Người báo cáo',
    description: 'Người tạo và theo dõi báo cáo sự cố.',
  },
  {
    code: 'SECURITY',
    name: 'Nhân viên an ninh',
    description: 'Người tiếp nhận và xử lý sự cố được phân công.',
  },
];

async function seedRoles() {
  try {
    await AppDataSource.initialize();

    const roleRepository = AppDataSource.getRepository(Role);

    await roleRepository
      .createQueryBuilder()
      .insert()
      .values(roles)
      .orIgnore()
      .execute();

    console.log('Seed roles thành công!');
  } catch {
    console.error(
      'Seed roles thất bại. Kiểm tra migration và kết nối database.',
    );
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void seedRoles();
