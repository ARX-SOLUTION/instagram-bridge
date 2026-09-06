import { UnauthorizedException } from '@nestjs/common';
import { MetaSignatureGuard } from './meta-signature.guard.js';

describe('MetaSignatureGuard', () => {
  it('rejects production webhooks when the Meta app secret is absent', () => {
    const config = {
      get: (key: string, fallback?: unknown) =>
        ({ nodeEnv: 'production' })[key] ?? fallback,
    };
    const guard = new MetaSignatureGuard(config as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', headers: {} }),
      }),
    };

    expect(() => guard.canActivate(context as never)).toThrow(
      UnauthorizedException,
    );
  });
});
