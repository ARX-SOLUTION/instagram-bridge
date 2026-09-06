import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';

@Injectable()
export class MetaSignatureGuard implements CanActivate {
  private readonly logger = new Logger(MetaSignatureGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();

    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (req.method === 'GET') return true;

    const appSecret = this.configService.get<string>('instagram.appSecret', '');
    if (!appSecret) {
      const nodeEnv = this.configService.get<string>('nodeEnv', 'development');
      const message = 'META_APP_SECRET is empty; webhook cannot be verified';

      if (nodeEnv === 'production') {
        this.logger.error(message);
        throw new UnauthorizedException(message);
      }

      this.logger.warn(`${message}; development-only bypass`);
      return true;
    }

    if (!signature) {
      throw new UnauthorizedException('Missing X-Hub-Signature-256');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException(
        'Raw body missing (enable rawBody: true in NestFactory)',
      );
    }

    const expected =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

    const a = Buffer.from(expected);
    const b = Buffer.from(signature);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
