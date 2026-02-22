// src/instagram/guards/meta-signature.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Request } from 'express';

@Injectable()
export class MetaSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // Meta Webhooks signature header:
    // X-Hub-Signature-256: sha256=...
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    // GET verify'ga signature bo'lmaydi; faqat POST'ni tekshiramiz
    if (req.method === 'GET') return true;

    if (!signature) {
      throw new UnauthorizedException('Missing X-Hub-Signature-256');
    }

    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      throw new UnauthorizedException('META_APP_SECRET not configured');
    }

    // Type assertion for rawBody property
    // Access rawBody with type assertion, but avoid unsafe any usage
    const rawBody: Buffer | undefined =
      req && typeof req === 'object' && 'rawBody' in req
        ? (req as { rawBody?: Buffer }).rawBody
        : undefined;
    if (!rawBody) {
      throw new UnauthorizedException(
        'Raw body missing (check main.ts json verify)',
      );
    }

    const expected =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

    // timing-safe compare
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
