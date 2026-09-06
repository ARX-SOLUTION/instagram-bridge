import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(private readonly configService: ConfigService) {}

  @Get('health')
  health() {
    const webhookReady = Boolean(
      this.configService.get<string>('instagram.verifyToken', ''),
    );
    const telegramReady = Boolean(
      this.configService.get<string>('telegram.botToken', ''),
    );
    const publishingEnabled = this.configService.get<boolean>(
      'instagram.publishEnabled',
      false,
    );
    const publishingReady =
      publishingEnabled &&
      Boolean(this.configService.get<string>('instagram.accessToken', '')) &&
      Boolean(this.configService.get<string>('instagram.igUserId', '')) &&
      Boolean(this.configService.get<string>('instagram.publishApiKey', ''));

    return {
      status: 'ok',
      service: 'instagram-bridge',
      readiness: {
        webhook: webhookReady ? 'ready' : 'missing_configuration',
        telegram: telegramReady ? 'ready' : 'missing_configuration',
        publishing: publishingReady
          ? 'ready'
          : publishingEnabled
            ? 'missing_configuration'
            : 'disabled',
      },
    };
  }
}
