import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { Request } from 'express';

@Injectable()
export class InstagramPublishGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const enabled = this.configService.get<boolean>(
      'instagram.publishEnabled',
      false,
    );
    const expectedKey = this.configService.get<string>(
      'instagram.publishApiKey',
      '',
    );

    if (!enabled || !expectedKey) {
      throw new ServiceUnavailableException(
        'Instagram publishing is unavailable',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const suppliedKey = request.header('x-instagram-publish-key') ?? '';
    const expected = Buffer.from(expectedKey);
    const supplied = Buffer.from(suppliedKey);

    if (
      !suppliedKey ||
      expected.length !== supplied.length ||
      !crypto.timingSafeEqual(expected, supplied)
    ) {
      throw new UnauthorizedException('Invalid Instagram publish key');
    }

    return true;
  }
}
