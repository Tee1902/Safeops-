import { ValidationPipe } from '@nestjs/common';
import { RegisterDto } from './register.dto.js';
import { UpdateUserDto } from '../../users/dto/update-user.dto.js';
import { ChangePasswordDto } from '../../users/dto/change-password.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
describe('Account validation regressions', () => {
  it.each([null, ' ', '\t\r\n'])(
    'rejects an invalid profile name %j',
    async (fullName) => {
      await expect(
        pipe.transform({ fullName }, { type: 'body', metatype: UpdateUserDto }),
      ).rejects.toThrow();
    },
  );
  it('allows nullable phone and avatar fields', async () => {
    await expect(
      pipe.transform(
        { phone: null, avatarUrl: null },
        { type: 'body', metatype: UpdateUserDto },
      ),
    ).resolves.toMatchObject({ phone: null, avatarUrl: null });
  });
  it('normalizes names and email whitespace before validation', async () => {
    const result = await pipe.transform(
      {
        fullName: '  Demo  ',
        email: '  demo@example.com  ',
        password: 'Password123!',
      },
      { type: 'body', metatype: RegisterDto },
    );
    expect(result).toMatchObject({
      fullName: 'Demo',
      email: 'demo@example.com',
    });
  });
  it('rejects UTF-8 passwords longer than bcrypt accepts even with fewer than 72 characters', async () => {
    const password = 'ắ'.repeat(25);
    await expect(
      pipe.transform(
        { fullName: 'Demo', email: 'demo@example.com', password },
        { type: 'body', metatype: RegisterDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        {
          currentPassword: 'Password123!',
          newPassword: password,
          confirmPassword: password,
        },
        { type: 'body', metatype: ChangePasswordDto },
      ),
    ).rejects.toThrow();
  });
});
