import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  validateTelegramInitData(initData: Record<string, string>): boolean {
    const secretKey = crypto
      .createHash('sha256')
      .update(this.configService.get<string>('TELEGRAM_BOT_TOKEN'))
      .digest();

    const checkString = Object.keys(initData)
      .filter((key) => key !== 'hash')
      .sort()
      .map((key) => `${key}=${initData[key]}`)
      .join('\n');

    const hash = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    return hash === initData.hash;
  }

  generateJwt(payload: Record<string, any>): string {
    return this.jwtService.sign(payload);
  }
}