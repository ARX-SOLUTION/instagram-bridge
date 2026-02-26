import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('telegram-login')
  telegramLogin(@Query() query: Record<string, string>) {
    if (!this.authService.validateTelegramInitData(query)) {
      throw new UnauthorizedException('Invalid Telegram init data');
    }

    const jwt = this.authService.generateJwt({
      id: query.id,
      username: query.username,
      first_name: query.first_name,
      last_name: query.last_name,
    });

    return { token: jwt };
  }
}