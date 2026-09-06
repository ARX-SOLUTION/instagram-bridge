import { AppController } from './app.controller.js';

describe('AppController', () => {
  it('returns health status', () => {
    const controller = new AppController({
      get: (key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'instagram.verifyToken': 'verify-token',
          'telegram.botToken': 'bot-token',
          'instagram.publishEnabled': true,
          'instagram.accessToken': 'access-token',
          'instagram.igUserId': 'ig-user',
          'instagram.publishApiKey': 'publish-key',
        };
        return values[key] ?? fallback;
      },
    } as never);

    expect(controller.health()).toEqual({
      status: 'ok',
      service: 'instagram-bridge',
      readiness: {
        webhook: 'ready',
        telegram: 'ready',
        publishing: 'ready',
      },
    });
  });
});
