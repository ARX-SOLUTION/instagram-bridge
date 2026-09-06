import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InstagramPublishGuard } from './instagram-publish.guard.js';

function contextFor(key?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ header: () => key }),
    }),
  };
}

describe('InstagramPublishGuard', () => {
  it('requires both a configured feature flag and the private publish key', () => {
    const config = {
      get: (key: string, fallback?: unknown) =>
        ({
          'instagram.publishEnabled': true,
          'instagram.publishApiKey': 'publish-secret',
        })[key] ?? fallback,
    };
    const guard = new InstagramPublishGuard(config as never);

    expect(guard.canActivate(contextFor('publish-secret') as never)).toBe(true);
    expect(() => guard.canActivate(contextFor('wrong-key') as never)).toThrow(
      UnauthorizedException,
    );
  });

  it('keeps the endpoint unavailable until publishing is explicitly enabled', () => {
    const config = {
      get: (_key: string, fallback?: unknown) => fallback,
    };
    const guard = new InstagramPublishGuard(config as never);

    expect(() => guard.canActivate(contextFor('any-key') as never)).toThrow(
      ServiceUnavailableException,
    );
  });
});
