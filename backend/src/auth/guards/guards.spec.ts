import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { CookieOriginGuard } from './cookie-origin.guard.js';
import { Roles } from '../decorators/roles.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import { ROLE_CODES } from '../roles.js';
import { actor, config } from '../../../test/fixtures.js';

@Roles('ADMIN')
class ProtectedController {
  admin() {}
  @Roles('OPERATOR') operator() {}
  @Public() public() {}
}
class MissingRolesController {
  unclassified() {}
}
function context(
  controller: typeof ProtectedController | typeof MissingRolesController,
  method: string,
  request: unknown,
) {
  return {
    getClass: () => controller,
    getHandler: () =>
      (controller.prototype as unknown as Record<string, unknown>)[method],
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
describe('RBAC default-deny contract', () => {
  const guard = new RolesGuard(new Reflector());
  it.each(ROLE_CODES)(
    'enforces class-level Admin permission for %s',
    (role) => {
      const check = () =>
        guard.canActivate(
          context(ProtectedController, 'admin', { user: { ...actor, role } }),
        );
      if (role === 'ADMIN') expect(check()).toBe(true);
      else expect(check).toThrow(expect.objectContaining({ status: 403 }));
    },
  );
  it('lets method roles override class roles', () => {
    expect(
      guard.canActivate(
        context(ProtectedController, 'operator', {
          user: { ...actor, role: 'OPERATOR' },
        }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        context(ProtectedController, 'operator', {
          user: { ...actor, role: 'ADMIN' },
        }),
      ),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
  it('denies routes without role metadata and protected routes without identity', () => {
    expect(() =>
      guard.canActivate(
        context(MissingRolesController, 'unclassified', { user: actor }),
      ),
    ).toThrow(expect.objectContaining({ status: 403 }));
    expect(() =>
      guard.canActivate(context(ProtectedController, 'admin', {})),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
  it('allows explicitly public methods without identity', () => {
    expect(guard.canActivate(context(ProtectedController, 'public', {}))).toBe(
      true,
    );
  });
});
describe('Cookie Origin protection', () => {
  const guard = new CookieOriginGuard(config());
  it.each([{ origin: 'http://localhost:3001' }, {}])(
    'accepts the configured origin or non-browser client %j',
    (headers) => {
      const request = {
        get: (key: string) =>
          (headers as Record<string, string | undefined>)[key],
      };
      expect(
        guard.canActivate(context(ProtectedController, 'public', request)),
      ).toBe(true);
    },
  );
  it.each([
    { origin: 'https://attacker.example' },
    { 'sec-fetch-site': 'cross-site' },
    { origin: 'null' },
  ])('rejects untrusted browser origin %j', (headers) => {
    const request = {
      get: (key: string) =>
        (headers as Record<string, string | undefined>)[key],
    };
    expect(() =>
      guard.canActivate(context(ProtectedController, 'public', request)),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
});
