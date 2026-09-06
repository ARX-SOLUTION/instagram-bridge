import { ValidationPipe } from '@nestjs/common';
import { WebhookVerifyDto } from './webhook-verify.dto.js';

describe('WebhookVerifyDto', () => {
  it('accepts Meta verification queries with dotted and underscore aliases', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          'hub.mode': 'subscribe',
          'hub.challenge': 'challenge-123',
          'hub.verify_token': 'verify-token',
          hub_mode: 'subscribe',
          hub_challenge: 'challenge-123',
          hub_verify_token: 'verify-token',
        },
        { type: 'query', metatype: WebhookVerifyDto },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        'hub.mode': 'subscribe',
        'hub.challenge': 'challenge-123',
        'hub.verify_token': 'verify-token',
      }),
    );
  });
});
