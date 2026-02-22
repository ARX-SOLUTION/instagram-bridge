import {
  CanActivate,
  ExecutionContext,
  Injectable,
  RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Request } from 'express';

@Injectable()
export class MetaSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();

    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (req.method === 'GET') return true;

    if (!signature) {
      throw new UnauthorizedException('Missing X-Hub-Signature-256');
    }

    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      throw new UnauthorizedException('META_APP_SECRET not configured');
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
